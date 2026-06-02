import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId || decoded.id };
    // Check admin email
    if (!process.env.ADMIN_EMAILS?.split(',').includes(decoded.email)) {
      return res.status(403).json({ error: 'Admin access only' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Main dashboard stats
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const { rows: [users] } = await query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_7d
      FROM users
    `);

    const { rows: [statements] } = await query(`
      SELECT
        COUNT(*) as total_statements,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as monthly_uploads,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as weekly_uploads,
        COALESCE(AVG(transaction_count), 0) as avg_transactions_parsed
      FROM statements
      WHERE status = 'done'
    `);

    const { rows: [transactions] } = await query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(DISTINCT user_id) as active_users,
        COALESCE(AVG(amount), 0) as avg_transaction_amount
      FROM transactions
      WHERE transaction_date >= NOW() - INTERVAL '30 days'
    `);

    // Retention: users who uploaded in last 30 days AND had uploaded before
    const { rows: [retention] } = await query(`
      SELECT COUNT(DISTINCT user_id) as retained_users
      FROM statements
      WHERE created_at >= NOW() - INTERVAL '30 days'
      AND user_id IN (
        SELECT DISTINCT user_id FROM statements
        WHERE created_at < NOW() - INTERVAL '30 days'
      )
    `);

    const retentionRate = users.total_users > 0
      ? Math.round((retention.retained_users / users.total_users) * 100)
      : 0;

    // Monthly upload trend (last 6 months)
    const { rows: monthlyTrend } = await query(`
      SELECT
        TO_CHAR(created_at, 'Mon YY') as month,
        EXTRACT(YEAR FROM created_at) as year,
        EXTRACT(MONTH FROM created_at) as month_num,
        COUNT(*) as uploads,
        COUNT(DISTINCT user_id) as unique_users
      FROM statements
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY month, year, month_num
      ORDER BY year, month_num
    `);

    // Most used features (based on page activity proxy — statement uploads by category)
    const { rows: topCategories } = await query(`
      SELECT category, COUNT(*) as count
      FROM transactions
      GROUP BY category
      ORDER BY count DESC
      LIMIT 6
    `);

    // User growth (last 6 months)
    const { rows: userGrowth } = await query(`
      SELECT
        TO_CHAR(created_at, 'Mon YY') as month,
        EXTRACT(YEAR FROM created_at) as year,
        EXTRACT(MONTH FROM created_at) as month_num,
        COUNT(*) as new_users
      FROM users
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY month, year, month_num
      ORDER BY year, month_num
    `);

    // Top users by activity
    const { rows: topUsers } = await query(`
      SELECT u.email, u.name, u.created_at,
        COUNT(DISTINCT s.id) as statements,
        COUNT(DISTINCT t.id) as transactions
      FROM users u
      LEFT JOIN statements s ON s.user_id = u.id
      LEFT JOIN transactions t ON t.user_id = u.id
      GROUP BY u.id, u.email, u.name, u.created_at
      ORDER BY transactions DESC
      LIMIT 10
    `);

    res.json({
      users: {
        total: parseInt(users.total_users),
        new_30d: parseInt(users.new_users_30d),
        new_7d: parseInt(users.new_users_7d),
        active: parseInt(transactions.active_users),
        retention_rate: retentionRate,
      },
      statements: {
        total: parseInt(statements.total_statements),
        monthly: parseInt(statements.monthly_uploads),
        weekly: parseInt(statements.weekly_uploads),
        avg_transactions_parsed: Math.round(parseFloat(statements.avg_transactions_parsed)),
      },
      transactions: {
        total_30d: parseInt(transactions.total_transactions),
        avg_amount: Math.round(parseFloat(transactions.avg_transaction_amount)),
      },
      monthlyTrend,
      userGrowth,
      topCategories,
      topUsers,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Waitlist
router.post('/waitlist', async (req, res) => {
  try {
    const { email, name, reason } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    await query(
      `INSERT INTO waitlist (email, name, reason) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
      [email, name, reason]
    );
    res.json({ message: 'Added to waitlist!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// Get waitlist (admin only)
router.get('/waitlist', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM waitlist ORDER BY created_at DESC`);
    res.json({ waitlist: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch waitlist' });
  }
});

export default router;