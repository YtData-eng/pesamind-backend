import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from './pool.js';

const router = express.Router();

// ─── Authentication ──────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId || decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Get Referral Info ───────────────────────────────────────────
router.get('/info', authenticate, async (req, res) => {
  try {
    const { rows: [user] } = await query(
      `SELECT referral_code, referral_count, free_months, plan FROM users WHERE id = $1`,
      [req.user.id]
    );

    const { rows: referrals } = await query(
      `SELECT r.created_at, r.status, u.name, u.email
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    const APP_URL = 'https://pesamind-frontend-f77z.vercel.app';
    res.json({
      referral_code: user.referral_code,
      referral_count: user.referral_count || 0,
      free_months: user.free_months || 0,
      referral_link: `${APP_URL}/register?ref=${user.referral_code}`,
      referrals,
      next_reward_at: 3 - ((user.referral_count || 0) % 3),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch referral info' });
  }
});

// ─── Process Referral (called internally on register) ────────────
export const processReferral = async (referralCode, newUserId) => {
  try {
    if (!referralCode) return;

    const { rows: [referrer] } = await query(
      `SELECT id, email, name, referral_count FROM users WHERE referral_code = $1`,
      [referralCode]
    );
    if (!referrer) return;

    // Link referral
    await query(
      `INSERT INTO referrals (referrer_id, referred_id, status) VALUES ($1, $2, 'completed')`,
      [referrer.id, newUserId]
    );

    // Update referral count
    const newCount = (referrer.referral_count || 0) + 1;
    await query(
      `UPDATE users SET referral_count = $1, referred_by = $2 WHERE id = $3`,
      [newCount, referrer.id, newUserId]
    );
    await query(
      `UPDATE users SET referral_count = $1 WHERE id = $2`,
      [newCount, referrer.id]
    );

    // Reward every 3 referrals — 1 free Pro month
    if (newCount % 3 === 0) {
      await query(
        `UPDATE users SET free_months = free_months + 1,
         plan = 'pro',
         plan_expires_at = COALESCE(plan_expires_at, NOW()) + INTERVAL '30 days'
         WHERE id = $1`,
        [referrer.id]
      );
      await query(
        `UPDATE referrals SET rewarded = TRUE WHERE referrer_id = $1 AND rewarded = FALSE`,
        [referrer.id]
      );

      // TODO: send reward email when emailService is ready
      console.log(`🎉 Referral reward unlocked for ${referrer.email} — ${Math.floor(newCount / 3)} free month(s)`);
    }
  } catch (err) {
    console.error('Referral processing error:', err);
  }
};

// ─── Share Stats ─────────────────────────────────────────────────
router.get('/share-stats', authenticate, async (req, res) => {
  try {
    const { rows: [totals] } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) as expenses,
        COUNT(*) as tx_count
      FROM transactions
      WHERE user_id = $1
      AND transaction_date >= NOW() - INTERVAL '30 days'
    `, [req.user.id]);

    const { rows: topCat } = await query(`
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE user_id = $1 AND type NOT IN ('receive','deposit','salary')
      AND transaction_date >= NOW() - INTERVAL '30 days'
      GROUP BY category ORDER BY total DESC LIMIT 1
    `, [req.user.id]);

    const income = parseFloat(totals.income) || 0;
    const expenses = parseFloat(totals.expenses) || 0;
    const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

    res.json({
      income,
      expenses,
      savingsRate,
      txCount: parseInt(totals.tx_count),
      topCategory: topCat[0]?.category?.replace(/_/g, ' ') || 'other',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch share stats' });
  }
});

export default router;