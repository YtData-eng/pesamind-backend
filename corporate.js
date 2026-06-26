import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCorporateInviteEmail } from './services/emailService.js';


// ─── Auth helpers ────────────────────────────────────────
const authCompany = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.company = { id: decoded.companyId };
    next();
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
};

// ─── Company signup ──────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, industry, contact_name, email, password, phone, employee_count } = req.body;
    if (!name || !contact_name || !email || !password) {
      return res.status(400).json({ error: 'Name, contact name, email and password are required' });
    }
    const { rows: [existing] } = await query(`SELECT id FROM companies WHERE email = $1`, [email]);
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: [company] } = await query(
      `INSERT INTO companies (name, industry, contact_name, email, password_hash, phone, employee_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, contact_name, email, plan, employee_count`,
      [name, industry, contact_name, email, passwordHash, phone, employee_count || 0]
    );
    const token = jwt.sign({ companyId: company.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, company });
  } catch (err) {
    console.error('Company signup error:', err);
    res.status(500).json({ error: 'Failed to create company account' });
  }
});

// ─── Company login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows: [company] } = await query(`SELECT * FROM companies WHERE email = $1`, [email]);
    if (!company) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, company.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ companyId: company.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    delete company.password_hash;
    res.json({ token, company });
  } catch (err) { res.status(500).json({ error: 'Login failed' }); }
});

// ─── Company profile ─────────────────────────────────────
router.get('/me', authCompany, async (req, res) => {
  try {
    const { rows: [company] } = await query(
      `SELECT id, name, industry, contact_name, email, phone, employee_count, plan, status, price_per_employee, created_at FROM companies WHERE id = $1`,
      [req.company.id]
    );
    res.json({ company });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch profile' }); }
});

// ─── Invite employees ────────────────────────────────────

router.post('/invite', authCompany, async (req, res) => {
  try {
    const { emails, department } = req.body;
    if (!emails || !emails.length) return res.status(400).json({ error: 'No emails provided' });

    const { rows: [company] } = await query(`SELECT name FROM companies WHERE id = $1`, [req.company.id]);

    const results = [];
    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      if (!email) continue;

      const token = crypto.randomBytes(20).toString('hex');

      await query(
        `INSERT INTO company_invites (company_id, email, token) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [req.company.id, email, token]
      );
      await query(
        `INSERT INTO company_employees (company_id, email, department, status)
         VALUES ($1,$2,$3,'invited') ON CONFLICT (company_id, email) DO NOTHING`,
        [req.company.id, email, department || null]
      );

      const inviteLink = `${process.env.APP_URL}/join?token=${token}`;
      const sent = await sendCorporateInviteEmail(email, company.name, inviteLink);
      results.push({ email, token, inviteLink, emailSent: sent });
    }

    res.json({ invited: results });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to send invites' });
  }
});

// ─── Accept invite (called after employee registers) ─────
router.post('/join', async (req, res) => {
  try {
    const { token, userId } = req.body;
    const { rows: [invite] } = await query(
      `SELECT * FROM company_invites WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );
    if (!invite) return res.status(400).json({ error: 'Invalid or expired invite link' });

    // Link employee to user account
    await query(
      `UPDATE company_employees SET user_id = $1, status = 'active', joined_at = NOW()
       WHERE company_id = $2 AND email = $3`,
      [userId, invite.company_id, invite.email]
    );
    // Mark invite used
    await query(`UPDATE company_invites SET used = TRUE WHERE token = $1`, [token]);
    // Give employee Pro access
    await query(
      `UPDATE users SET plan = 'pro', plan_expires_at = NOW() + INTERVAL '1 year' WHERE id = $1`,
      [userId]
    );
    res.json({ success: true, message: 'Welcome to your company wellness programme!' });
  } catch (err) { res.status(500).json({ error: 'Failed to join programme' }); }
});

// ─── Employee list ───────────────────────────────────────
router.get('/employees', authCompany, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ce.id, ce.email, ce.name, ce.department, ce.status, ce.joined_at,
        CASE WHEN ce.user_id IS NOT NULL THEN TRUE ELSE FALSE END as has_account
       FROM company_employees ce
       WHERE ce.company_id = $1
       ORDER BY ce.created_at DESC`,
      [req.company.id]
    );
    res.json({ employees: rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch employees' }); }
});

// ─── Anonymised workforce wellness dashboard ─────────────
// IMPORTANT: This never exposes individual employee data.
// Only aggregate, anonymised statistics are returned.
router.get('/wellness', authCompany, async (req, res) => {
  try {
    const { rows: [counts] } = await query(
      `SELECT
        COUNT(*) as total_invited,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as total_active,
        COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as total_registered
       FROM company_employees WHERE company_id = $1`,
      [req.company.id]
    );

    // Aggregate financial health data — anonymised, no individual data
    const { rows: healthData } = await query(
      `SELECT
        ROUND(AVG(fs.score)) as avg_health_score,
        COUNT(CASE WHEN fs.score >= 70 THEN 1 END) as financially_healthy,
        COUNT(CASE WHEN fs.score >= 40 AND fs.score < 70 THEN 1 END) as needs_attention,
        COUNT(CASE WHEN fs.score < 40 THEN 1 END) as high_risk
       FROM company_employees ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN (
         SELECT user_id, score FROM (
           SELECT t.user_id, 60 as score FROM transactions t GROUP BY t.user_id
         ) sub
       ) fs ON fs.user_id = ce.user_id
       WHERE ce.company_id = $1 AND ce.status = 'active'`,
      [req.company.id]
    );

    // Top spending categories across workforce (anonymised aggregate)
    const { rows: topCategories } = await query(
      `SELECT t.category, COUNT(*) as frequency, ROUND(AVG(t.amount)) as avg_amount
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       JOIN company_employees ce ON ce.user_id = u.id
       WHERE ce.company_id = $1 AND t.type != 'receive'
       GROUP BY t.category
       ORDER BY frequency DESC LIMIT 5`,
      [req.company.id]
    );

    const adoption = counts.total_invited > 0
      ? Math.round((parseInt(counts.total_registered) / parseInt(counts.total_invited)) * 100)
      : 0;

    res.json({
      counts,
      adoption,
      health: healthData[0] || {},
      topCategories,
      monthlyBill: parseInt(counts.total_active) * 500,
    });
  } catch (err) {
    console.error('Wellness error:', err);
    res.status(500).json({ error: 'Failed to fetch wellness data' });
  }
});

export default router;