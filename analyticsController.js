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
    const { month } = req.query;
    const monthFilter = month
      ? `AND TO_CHAR(transaction_date, 'YYYY-MM') = '${month}'`
      : `AND transaction_date >= NOW() - INTERVAL '365 days'`;

    const { rows: [totals] } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS total_expenses,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = $1 ${monthFilter}
    `, [userId]);

    const { rows: categories } = await query(`
      SELECT category, SUM(amount) AS total, COUNT(*) AS count
      FROM transactions
      WHERE user_id = $1 AND type NOT IN ('receive','deposit','salary') ${monthFilter}
      GROUP BY category
      ORDER BY total DESC
    `, [userId]);

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

    const { rows: flagged } = await query(`
      SELECT * FROM transactions
      WHERE user_id = $1 AND is_flagged = TRUE ${monthFilter}
      ORDER BY transaction_date DESC
      LIMIT 10
    `, [userId]);

    const { rows: recent } = await query(`
      SELECT * FROM transactions
      WHERE user_id = $1 ${monthFilter}
      ORDER BY transaction_date DESC
      LIMIT 20
    `, [userId]);

    res.json({ totals, categories, dailyTrend, flagged, recent });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

export const getMonthlySummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const { rows: transactions } = await query(
      `SELECT * FROM transactions WHERE user_id = $1 AND TO_CHAR(transaction_date,'YYYY-MM') = $2`,
      [userId, month]
    );

    if (!transactions.length) {
      return res.json({ summary: 'No transactions found for this period. Upload an M-Pesa statement to get AI insights!' });
    }

    const totalIncome = transactions
      .filter(t => ['receive', 'deposit', 'salary'].includes(t.type))
      .reduce((s, t) => s + parseFloat(t.amount), 0);

    const totalExpenses = transactions
      .filter(t => !['receive', 'deposit', 'salary'].includes(t.type))
      .reduce((s, t) => s + parseFloat(t.amount), 0);

    const catMap = {};
    transactions.forEach(t => {
      if (!['receive', 'deposit', 'salary'].includes(t.type)) {
        catMap[t.category] = (catMap[t.category] || 0) + parseFloat(t.amount);
      }
    });

    const topCategories = Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, total]) => ({ category, total }));

    const summary = await generateMonthlySummary({
      month, transactions, totalIncome, totalExpenses, topCategories,
    });

    res.json({ summary });
  } catch (err) {
    console.error('Monthly summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

export const getBudgets = async (req, res) => {
  try {
    const now = new Date();
    const month = req.query.month || now.getMonth() + 1;
    const year = req.query.year || now.getFullYear();

    const { rows } = await query(
      `SELECT b.*, COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t ON t.user_id = b.user_id 
         AND t.category = b.category
         AND EXTRACT(MONTH FROM t.transaction_date) = b.month
         AND EXTRACT(YEAR FROM t.transaction_date) = b.year
         AND t.type NOT IN ('receive','deposit','salary')
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
       GROUP BY b.id`,
      [req.user.id, month, year]
    );
    res.json({ budgets: rows });
  } catch (err) {
    console.error('Budgets error:', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
};

export const setBudget = async (req, res) => {
  try {
    const { category, amount, month, year } = req.body;
    const { rows: [budget] } = await query(
      `INSERT INTO budgets (user_id, category, amount, month, year)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, category, month, year) DO UPDATE SET amount = $3
       RETURNING *`,
      [req.user.id, category, amount, month, year]
    );
    res.json({ budget });
  } catch (err) {
    console.error('Budget error:', err);
    res.status(500).json({ error: 'Failed to set budget' });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, type, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = ['user_id = $1'];
    const params = [userId];
    let i = 2;

    if (category) { conditions.push(`category = $${i++}`); params.push(category); }
    if (type) { conditions.push(`type = $${i++}`); params.push(type); }

    const whereClause = conditions.join(' AND ');

    const countResult = await query(`SELECT COUNT(*) FROM transactions WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(
      `SELECT * FROM transactions WHERE ${whereClause} ORDER BY transaction_date DESC LIMIT $${i} OFFSET $${i+1}`,
      params
    );

    res.json({
      transactions: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

router.get('/overview', authenticate, getAnalytics);
router.get('/summary', authenticate, getMonthlySummary);
router.get('/budgets', authenticate, getBudgets);
router.post('/budgets', authenticate, setBudget);
router.get('/transactions', authenticate, getTransactions);

export const getHealthScore = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: [stats] } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS expenses,
        COUNT(*) AS tx_count
      FROM transactions
      WHERE user_id = $1
      AND transaction_date >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const { rows: [prevStats] } = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) AS expenses
      FROM transactions
      WHERE user_id = $1
      AND transaction_date >= NOW() - INTERVAL '60 days'
      AND transaction_date < NOW() - INTERVAL '30 days'
    `, [userId]);

    const { rows: topCat } = await query(`
      SELECT category, SUM(amount) AS total
      FROM transactions
      WHERE user_id = $1
      AND type NOT IN ('receive','deposit','salary')
      AND transaction_date >= NOW() - INTERVAL '30 days'
      GROUP BY category ORDER BY total DESC LIMIT 1
    `, [userId]);

    const income = parseFloat(stats.income) || 0;
    const expenses = parseFloat(stats.expenses) || 0;
    const prevExpenses = parseFloat(prevStats.expenses) || 0;

    // Calculate score components
    const savingsRate = income > 0 ? (income - expenses) / income : 0;
    const spendingChange = prevExpenses > 0 ? (expenses - prevExpenses) / prevExpenses : 0;

    let score = 50;
    if (savingsRate >= 0.3) score += 25;
    else if (savingsRate >= 0.2) score += 20;
    else if (savingsRate >= 0.1) score += 10;
    else if (savingsRate < 0) score -= 20;

    if (spendingChange < 0) score += 15;
    else if (spendingChange < 0.1) score += 10;
    else if (spendingChange > 0.3) score -= 15;
    else if (spendingChange > 0.2) score -= 10;

    if (stats.tx_count > 50) score += 10;

    score = Math.min(100, Math.max(0, score));

    const insights = [];
    if (savingsRate < 0) insights.push(`⚠️ You spent more than you earned this month`);
    else if (savingsRate > 0.2) insights.push(`✅ Great job! You saved ${Math.round(savingsRate * 100)}% of your income`);
    
    if (spendingChange > 0.2) insights.push(`📈 Spending increased ${Math.round(spendingChange * 100)}% vs last month`);
    else if (spendingChange < -0.1) insights.push(`📉 Spending decreased ${Math.round(Math.abs(spendingChange) * 100)}% vs last month`);

    if (topCat.length > 0) insights.push(`🏆 Largest category: ${topCat[0].category?.replace(/_/g, ' ')} (KSH ${Number(topCat[0].total).toLocaleString()})`);

    const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work';

    res.json({ score, grade, insights, savingsRate: Math.round(savingsRate * 100), spendingChange: Math.round(spendingChange * 100) });
  } catch (err) {
    console.error('Health score error:', err);
    res.status(500).json({ error: 'Failed to calculate health score' });
  }
};

export default router;
export const generateAIBudgets = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: spending } = await query(`
      SELECT category, AVG(monthly_total) as avg_monthly
      FROM (
        SELECT category,
          EXTRACT(YEAR FROM transaction_date) as yr,
          EXTRACT(MONTH FROM transaction_date) as mo,
          SUM(amount) as monthly_total
        FROM transactions
        WHERE user_id = $1
        AND type NOT IN ('receive','deposit','salary')
        AND transaction_date >= NOW() - INTERVAL '3 months'
        GROUP BY category, yr, mo
      ) sub
      GROUP BY category
      ORDER BY avg_monthly DESC
    `, [userId]);

    const { rows: [income] } = await query(`
      SELECT COALESCE(AVG(monthly_income), 0) as avg_income
      FROM (
        SELECT EXTRACT(YEAR FROM transaction_date) as yr,
          EXTRACT(MONTH FROM transaction_date) as mo,
          SUM(amount) as monthly_income
        FROM transactions
        WHERE user_id = $1
        AND type IN ('receive','deposit','salary')
        AND transaction_date >= NOW() - INTERVAL '3 months'
        GROUP BY yr, mo
      ) sub
    `, [userId]);

    const avgIncome = parseFloat(income.avg_income) || 0;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const budgets = spending.map(s => ({
      category: s.category,
      suggested: Math.round(parseFloat(s.avg_monthly) * 0.9),
      current_avg: Math.round(parseFloat(s.avg_monthly)),
    }));

    // Auto-insert budgets
    for (const b of budgets) {
      if (b.suggested > 0) {
        await query(`
          INSERT INTO budgets (user_id, category, amount, month, year)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, category, month, year) DO NOTHING
        `, [userId, b.category, b.suggested, month, year]);
      }
    }

    res.json({ budgets, avgIncome: Math.round(avgIncome), month, year });
  } catch (err) {
    console.error('AI budget error:', err);
    res.status(500).json({ error: 'Failed to generate budgets' });
  }
};
router.get('/health-score', authenticate, getHealthScore);
router.post('/generate-budgets', authenticate, generateAIBudgets);