import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import { generateMonthlySummary } from './services/aiService.js';
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
export const getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month } = req.query; // e.g. 2024-06

    const monthFilter = month
      ? `AND TO_CHAR(transaction_date, 'YYYY-MM') = '${month}'`
      : `AND transaction_date >= NOW() - INTERVAL '365 days'`;

    // Total income & expenses
    const { rows: [totals] } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS total_expenses,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = $1 ${monthFilter}
    `, [userId]);

    // Spending by category
    const { rows: categories } = await query(`
      SELECT category, SUM(amount) AS total, COUNT(*) AS count
      FROM transactions
      WHERE user_id = $1 AND type NOT IN ('receive','deposit','salary') ${monthFilter}
      GROUP BY category
      ORDER BY total DESC
    `, [userId]);

    // Daily spending trend
    const { rows: dailyTrend } = await query(`
      SELECT 
        DATE(transaction_date) AS date,
        SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END) AS expenses,
        SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END) AS income
      FROM transactions
      WHERE user_id = $1 ${monthFilter}
      GROUP BY DATE(transaction_date)
      ORDER BY date ASC
    `, [userId]);

    // Flagged transactions
    const { rows: flagged } = await query(`
      SELECT * FROM transactions
      WHERE user_id = $1 AND is_flagged = TRUE ${monthFilter}
      ORDER BY transaction_date DESC
      LIMIT 10
    `, [userId]);

    // Recent transactions
    const { rows: recent } = await query(`
      SELECT * FROM transactions
      WHERE user_id = $1 ${monthFilter}
      ORDER BY transaction_date DESC
      LIMIT 20
    `, [userId]);

    res.json({
      totals,
      categories,
      dailyTrend,
      flagged,
      recent,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

export const getMonthlySummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month } = req.params;

    // Check if summary exists
    const { rows: existing } = await query(
      `SELECT * FROM monthly_summaries WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    if (existing.length) {
      return res.json(existing[0]);
    }

    // Generate new summary
    const { rows: transactions } = await query(
      `SELECT * FROM transactions WHERE user_id = $1 AND TO_CHAR(transaction_date,'YYYY-MM') = $2`,
      [userId, month]
    );

    if (!transactions.length) {
      return res.status(404).json({ error: 'No transactions for this month' });
    }

    const totalIncome = transactions
      .filter((t) => ['receive', 'deposit', 'salary'].includes(t.type))
      .reduce((s, t) => s + parseFloat(t.amount), 0);

    const totalExpenses = transactions
      .filter((t) => !['receive', 'deposit', 'salary'].includes(t.type))
      .reduce((s, t) => s + parseFloat(t.amount), 0);

    // Top categories
    const catMap = {};
    transactions.forEach((t) => {
      if (!['receive', 'deposit', 'salary'].includes(t.type)) {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
      }
    });
    const topCategories = Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, total]) => ({ category, total }));

    const ai_summary = await generateMonthlySummary({
      month, transactions, totalIncome, totalExpenses, topCategories,
    });

    const { rows: [summary] } = await query(
      `INSERT INTO monthly_summaries (user_id, month, total_income, total_expenses, top_categories, ai_summary)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, month, totalIncome, totalExpenses, JSON.stringify(topCategories), ai_summary]
    );

    res.json(summary);
  } catch (err) {
    console.error('Monthly summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

export const getBudgets = async (req, res) => {
  try {
    const { month } = req.query;
    const { rows } = await query(
      `SELECT b.*, 
        COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t ON t.user_id = b.user_id 
         AND t.category = b.category
         AND TO_CHAR(t.transaction_date,'YYYY-MM') = b.month
         AND t.type NOT IN ('receive','deposit','salary')
       WHERE b.user_id = $1 AND b.month = $2
       GROUP BY b.id`,
      [req.user.id, month]
    );
    res.json({ budgets: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
};

export const setBudget = async (req, res) => {
  try {
    const { category, amount, month } = req.body;
    const { rows: [budget] } = await query(
      `INSERT INTO budgets (user_id, category, amount, month)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, category, month) DO UPDATE SET amount = $3
       RETURNING *`,
      [req.user.id, category, amount, month]
    );
    res.json({ budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set budget' });
  }
};
router.get('/overview', authenticate, getAnalytics);
router.get('/summary', authenticate, getMonthlySummary);
router.get('/budgets', authenticate, getBudgets);
router.post('/budgets', authenticate, setBudget);
export default router;
