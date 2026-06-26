import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId || decoded.id };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all fraud alerts
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT fa.*, t.description as tx_description, t.amount as tx_amount, t.transaction_date as tx_date
       FROM fraud_alerts fa
       JOIN transactions t ON fa.transaction_id = t.id
       WHERE fa.user_id = $1
       ORDER BY fa.created_at DESC`,
      [req.user.id]
    );
    res.json({ alerts: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Fraud stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_severity,
        COUNT(CASE WHEN resolved = FALSE THEN 1 END) as unresolved,
        COUNT(CASE WHEN resolved = TRUE THEN 1 END) as resolved
       FROM fraud_alerts WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ stats: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Duplicate transactions
router.get('/duplicates', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
        description, amount, COUNT(*) as count,
        MIN(transaction_date) as first_seen,
        MAX(transaction_date) as last_seen,
        array_agg(id) as transaction_ids
       FROM transactions
       WHERE user_id = $1
       AND type NOT IN ('receive','deposit','salary')
       GROUP BY description, amount
       HAVING COUNT(*) > 1
       ORDER BY count DESC, amount DESC
       LIMIT 10`,
      [req.user.id]
    );
    res.json({ duplicates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch duplicates' });
  }
});

// Unusual spending spikes
router.get('/spikes', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `WITH monthly_avg AS (
        SELECT category,
          AVG(monthly_total) as avg_spend,
          STDDEV(monthly_total) as stddev_spend
        FROM (
          SELECT category,
            DATE_TRUNC('month', transaction_date) as month,
            SUM(amount) as monthly_total
          FROM transactions
          WHERE user_id = $1
          AND type NOT IN ('receive','deposit','salary')
          AND transaction_date >= NOW() - INTERVAL '6 months'
          GROUP BY category, DATE_TRUNC('month', transaction_date)
        ) sub
        GROUP BY category
      ),
      current_month AS (
        SELECT category, SUM(amount) as current_spend
        FROM transactions
        WHERE user_id = $1
        AND type NOT IN ('receive','deposit','salary')
        AND DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', NOW())
        GROUP BY category
      )
      SELECT
        cm.category,
        cm.current_spend,
        ma.avg_spend,
        ROUND(((cm.current_spend - ma.avg_spend) / NULLIF(ma.avg_spend, 0) * 100)::numeric, 0) as pct_change
      FROM current_month cm
      JOIN monthly_avg ma ON cm.category = ma.category
      WHERE cm.current_spend > ma.avg_spend * 1.5
      AND ma.avg_spend > 0
      ORDER BY pct_change DESC
      LIMIT 5`,
      [req.user.id]
    );
    res.json({ spikes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch spikes' });
  }
});

// New merchants (first time payments)
router.get('/new-merchants', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT description, amount, transaction_date, category
       FROM transactions
       WHERE user_id = $1
       AND type NOT IN ('receive','deposit','salary')
       AND transaction_date >= NOW() - INTERVAL '30 days'
       AND description NOT IN (
         SELECT DISTINCT description FROM transactions
         WHERE user_id = $1
         AND transaction_date < NOW() - INTERVAL '30 days'
       )
       ORDER BY transaction_date DESC
       LIMIT 10`,
      [req.user.id]
    );
    res.json({ merchants: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch new merchants' });
  }
});

// Scan transactions
router.post('/scan', authenticate, async (req, res) => {
  try {
    const SCAM_PATTERNS = [
      { pattern: /you have won/i, type: 'lottery_scam', severity: 'high' },
      { pattern: /safaricom refund/i, type: 'refund_scam', severity: 'high' },
      { pattern: /send.*to receive/i, type: 'advance_fee', severity: 'high' },
      { pattern: /mpesa agent.*pin/i, type: 'phishing', severity: 'high' },
      { pattern: /reversal.*error/i, type: 'reversal_scam', severity: 'medium' },
    ];

    const { rows: txs } = await query(
      `SELECT id, description, amount, transaction_date FROM transactions
       WHERE user_id = $1 AND fraud_score = 0
       ORDER BY transaction_date DESC LIMIT 200`,
      [req.user.id]
    );

    let alertCount = 0;
    for (const tx of txs) {
      for (const { pattern, type, severity } of SCAM_PATTERNS) {
        if (pattern.test(tx.description)) {
          await query(
            `UPDATE transactions SET fraud_score = $1, is_flagged = TRUE WHERE id = $2`,
            [severity === 'high' ? 90 : 60, tx.id]
          );
          await query(
            `INSERT INTO fraud_alerts (user_id, transaction_id, alert_type, severity, description)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [req.user.id, tx.id, type, severity, `Suspicious: "${tx.description}" - KSH ${tx.amount}`]
          );
          alertCount++;
          break;
        }
      }
    }

    res.json({ message: `Scanned ${txs.length} transactions`, alertCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// Resolve alert
router.patch('/alerts/:id/resolve', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE fraud_alerts SET resolved = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
    res.json({ alert: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

export default router;