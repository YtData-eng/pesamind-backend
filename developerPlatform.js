import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { calculateCreditScore } from './creditScore.js';


// ─── Helpers ───────────────────────────────────────────
const generateApiKey = (env = 'sandbox') => {
  const prefix = env === 'live' ? 'pm_live_' : 'pm_test_';
  const raw = crypto.randomBytes(24).toString('hex');
  const fullKey = `${prefix}${raw}`;
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  return { fullKey, hash, prefix: fullKey.slice(0, 12) + '...' };
};

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

// Developer JWT auth middleware
const authDev = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.developer = { id: decoded.developerId };
    next();
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
};

// API key auth middleware (for public API endpoints)
const authApiKey = async (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' });
  try {
    const hash = hashKey(key);
    const { rows: [apiKey] } = await query(
      `SELECT ak.*, d.tier, d.status as dev_status FROM api_keys ak
       JOIN developers d ON d.id = ak.developer_id
       WHERE ak.key_hash = $1 AND ak.is_active = TRUE`, [hash]
    );
    if (!apiKey) return res.status(401).json({ error: 'Invalid or inactive API key' });
    if (apiKey.dev_status !== 'active') return res.status(403).json({ error: 'Developer account suspended' });
    req.apiKey = apiKey;
    query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [apiKey.id]).catch(()=>{});
    next();
  } catch (e) { res.status(500).json({ error: 'Auth error' }); }
};

// Usage logger
const logUsage = async (req, endpoint, statusCode, startTime) => {
  if (!req.apiKey) return;
  const responseTime = Date.now() - startTime;
  try {
    await query(
      `INSERT INTO api_usage (api_key_id, developer_id, endpoint, status_code, response_time_ms) VALUES ($1,$2,$3,$4,$5)`,
      [req.apiKey.id, req.apiKey.developer_id, endpoint, statusCode, responseTime]
    );
    await query(
      `INSERT INTO api_usage_daily (developer_id, date, endpoint, call_count) VALUES ($1, CURRENT_DATE, $2, 1)
       ON CONFLICT (developer_id, date, endpoint) DO UPDATE SET call_count = api_usage_daily.call_count + 1`,
      [req.apiKey.developer_id, endpoint]
    );
  } catch (e) { console.error('Usage log error:', e.message); }
};

// ─── DEVELOPER ACCOUNT MANAGEMENT ─────────────────────────

router.post('/signup', async (req, res) => {
  try {
    const { company_name, contact_name, email, password, use_case } = req.body;
    if (!company_name || !contact_name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const { rows: [existing] } = await query(`SELECT id FROM developers WHERE email = $1`, [email]);
    if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: [dev] } = await query(
      `INSERT INTO developers (company_name, contact_name, email, password_hash, use_case)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, company_name, contact_name, email, tier`,
      [company_name, contact_name, email, passwordHash, use_case]
    );

    // Auto-generate first sandbox key
    const { fullKey, hash, prefix } = generateApiKey('sandbox');
    await query(
      `INSERT INTO api_keys (developer_id, key_prefix, key_hash, name, environment) VALUES ($1,$2,$3,'Default Sandbox Key','sandbox')`,
      [dev.id, prefix, hash]
    );

    const token = jwt.sign({ developerId: dev.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, developer: dev, apiKey: fullKey });
  } catch (err) {
    console.error('Dev signup error:', err);
    res.status(500).json({ error: 'Failed to create developer account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows: [dev] } = await query(`SELECT * FROM developers WHERE email = $1`, [email]);
    if (!dev) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, dev.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ developerId: dev.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    delete dev.password_hash;
    res.json({ token, developer: dev });
  } catch (err) { res.status(500).json({ error: 'Login failed' }); }
});

router.get('/me', authDev, async (req, res) => {
  try {
    const { rows: [dev] } = await query(
      `SELECT id, company_name, contact_name, email, tier, status, created_at FROM developers WHERE id = $1`,
      [req.developer.id]
    );
    res.json({ developer: dev });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch profile' }); }
});

// ─── API KEY MANAGEMENT ────────────────────────────────────

router.get('/keys', authDev, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, key_prefix, name, environment, is_active, last_used_at, created_at
       FROM api_keys WHERE developer_id = $1 ORDER BY created_at DESC`,
      [req.developer.id]
    );
    res.json({ keys: rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch keys' }); }
});

router.post('/keys', authDev, async (req, res) => {
  try {
    const { name, environment } = req.body;
    const env = environment === 'live' ? 'live' : 'sandbox';
    const { fullKey, hash, prefix } = generateApiKey(env);
    const { rows: [key] } = await query(
      `INSERT INTO api_keys (developer_id, key_prefix, key_hash, name, environment)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, key_prefix, name, environment, created_at`,
      [req.developer.id, prefix, hash, name || 'New Key', env]
    );
    res.json({ key, fullKey }); // fullKey only ever shown once
  } catch (err) { res.status(500).json({ error: 'Failed to create key' }); }
});

router.delete('/keys/:id', authDev, async (req, res) => {
  try {
    await query(`UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND developer_id = $2`, [req.params.id, req.developer.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to revoke key' }); }
});

// ─── USAGE DASHBOARD ────────────────────────────────────────

router.get('/usage', authDev, async (req, res) => {
  try {
    const { rows: daily } = await query(
      `SELECT date, SUM(call_count) as calls FROM api_usage_daily
       WHERE developer_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY date ORDER BY date ASC`,
      [req.developer.id]
    );
    const { rows: byEndpoint } = await query(
      `SELECT endpoint, SUM(call_count) as calls FROM api_usage_daily
       WHERE developer_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY endpoint ORDER BY calls DESC`,
      [req.developer.id]
    );
    const { rows: [totals] } = await query(
      `SELECT COUNT(*) as total_calls, COUNT(DISTINCT date) as active_days
       FROM api_usage_daily WHERE developer_id = $1`,
      [req.developer.id]
    );
    res.json({ daily, byEndpoint, totals });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch usage' }); }
});

// ═══════════════════════════════════════════════════════
// PUBLIC API ENDPOINTS — These are what developers call
// ═══════════════════════════════════════════════════════


// Partner endpoint - requires the end-user's consent token (their own userId for now;
// in production this requires an explicit consent-sharing flow, not just any userId)
router.get('/v1/credit/score/:userId', authApiKey, async (req, res) => {
  const start = Date.now();
  try {
    const result = await calculateCreditScore(req.params.userId);
    await logUsage(req, 'credit_score', 200, start);
    res.json(result);
  } catch (err) {
    await logUsage(req, 'credit_score', 500, start);
    res.status(500).json({ error: 'Failed to calculate credit score' });
  }
});


// Health check (no auth) - lets devs test connectivity
router.get('/v1/ping', (req, res) => {
  res.json({ status: 'ok', message: 'PesaMind API is live', timestamp: new Date().toISOString() });
});

// Check fraud risk of a phone number
router.get('/v1/fraud/check/:phone', authApiKey, async (req, res) => {
  const start = Date.now();
  try {
    let phone = req.params.phone.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '');
    const { rows: [fraudData] } = await query(`SELECT * FROM fraud_numbers WHERE phone_number = $1`, [phone]);

    const result = !fraudData
      ? { phone, status: 'clean', risk_score: 0 }
      : { phone, status: 'flagged', risk_score: fraudData.risk_score, report_count: fraudData.report_count, scam_type: fraudData.scam_type };

    await logUsage(req, 'fraud_check', 200, start);
    res.json(result);
  } catch (err) {
    await logUsage(req, 'fraud_check', 500, start);
    res.status(500).json({ error: 'Failed to check number' });
  }
});

// Analyse SMS for scam patterns
router.post('/v1/fraud/analyse-sms', authApiKey, async (req, res) => {
  const start = Date.now();
  try {
    const { sms_text } = req.body;
    if (!sms_text) { await logUsage(req,'sms_analyse',400,start); return res.status(400).json({ error: 'sms_text is required' }); }

    // Reuse the same keyword logic as the consumer Fraud Shield
    const SCAM_KEYWORDS = {
      reversal_scam: ['reverse', 'sent by mistake', 'wrong number', 'send back'],
      fake_safaricom: ['safaricom agent', 'line will be deactivated', 'verify your line', 'sim registration'],
      job_scam: ['job offer', 'registration fee', 'interview fee', 'hr department'],
      lottery_prize: ['you have won', 'winner', 'claim your prize', 'processing fee'],
      family_emergency: ['mum', 'dad', 'emergency', 'hospital', 'new number'],
      investment_scam: ['guaranteed returns', 'double your money', 'investment opportunity'],
    };
    let detected = null, matches = 0;
    for (const [type, kws] of Object.entries(SCAM_KEYWORDS)) {
      const m = kws.filter(k => sms_text.toLowerCase().includes(k)).length;
      if (m > matches) { matches = m; detected = type; }
    }
    const result = { is_scam: matches > 0, scam_type: detected, confidence: matches > 0 ? Math.min(matches * 30, 95) : 5 };
    await logUsage(req, 'sms_analyse', 200, start);
    res.json(result);
  } catch (err) {
    await logUsage(req, 'sms_analyse', 500, start);
    res.status(500).json({ error: 'Failed to analyse SMS' });
  }
});

// Parse M-Pesa statement & return health score (requires PDF buffer - placeholder structure)
router.post('/v1/statements/parse', authApiKey, async (req, res) => {
  const start = Date.now();
  // NOTE: full implementation reuses your existing mpesaParser.js logic.
  // Returning structure here; wire up multer + parser in production.
  await logUsage(req, 'parse_statement', 501, start);
  res.status(501).json({ error: 'Statement parsing via API requires file upload - see /developers/docs' });
});

export default router;