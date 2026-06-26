import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.user = { id: decoded.userId || decoded.id };
    next();
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
};

// Known lending paybills/keywords in M-Pesa descriptions
const LENDER_KEYWORDS = ['fuliza', 'm-shwari', 'mshwari', 'kcb m-pesa', 'tala', 'branch', 'okash', 'zenka', 'hela', 'haraka', 'ipesa', 'opesa'];

// ─── CORE SCORING ENGINE ───────────────────────────────────
const calculateCreditScore = async (userId) => {
  // Pull 6 months of transaction data
  const { rows: txs } = await query(
    `SELECT * FROM transactions WHERE user_id = $1 AND transaction_date >= NOW() - INTERVAL '6 months' ORDER BY transaction_date ASC`,
    [userId]
  );

  if (txs.length === 0) {
    return { score: null, grade: 'Insufficient Data', factors: [], message: 'Upload at least one M-Pesa statement to generate a credit score.' };
  }

  const incomeTxs = txs.filter(t => t.type === 'receive');
  const expenseTxs = txs.filter(t => t.type !== 'receive');

  // ── Factor 1: Income Stability (30%) ──────────────────────
  const monthlyIncome = {};
  incomeTxs.forEach(t => {
    const month = new Date(t.transaction_date).toISOString().slice(0, 7);
    monthlyIncome[month] = (monthlyIncome[month] || 0) + Number(t.amount);
  });
  const incomeValues = Object.values(monthlyIncome);
  const monthsWithIncome = incomeValues.length;
  const avgIncome = incomeValues.reduce((a, b) => a + b, 0) / (monthsWithIncome || 1);
  const incomeVariance = incomeValues.length > 1
    ? Math.sqrt(incomeValues.reduce((sum, v) => sum + Math.pow(v - avgIncome, 2), 0) / incomeValues.length) / (avgIncome || 1)
    : 1;
  // Lower variance + more months with income = higher score
  const incomeStabilityScore = Math.max(0, Math.min(100,
    (monthsWithIncome / 6) * 50 + (1 - Math.min(incomeVariance, 1)) * 50
  ));

  // Income trend (compare first half vs second half of period)
  const midpoint = Math.floor(incomeValues.length / 2);
  const firstHalfAvg = incomeValues.slice(0, midpoint).reduce((a, b) => a + b, 0) / (midpoint || 1);
  const secondHalfAvg = incomeValues.slice(midpoint).reduce((a, b) => a + b, 0) / ((incomeValues.length - midpoint) || 1);
  const incomeTrend = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  // ── Factor 2: Spending Discipline (25%) ────────────────────
  const totalIncome = incomeTxs.reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = expenseTxs.reduce((s, t) => s + Number(t.amount), 0);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
  const spendingDisciplineScore = Math.max(0, Math.min(100, 50 + savingsRate));

  // ── Factor 3: Debt & Obligation Behaviour (20%) ────────────
  const lenderTxs = txs.filter(t => LENDER_KEYWORDS.some(kw => t.description?.toLowerCase().includes(kw)));
  const lenderBorrowCount = lenderTxs.filter(t => t.type === 'receive').length;
  const lenderRepayCount = lenderTxs.filter(t => t.type !== 'receive').length;
  // Good sign: repaying roughly as often as borrowing, not excessive borrowing
  let debtBehaviorScore = 80; // default neutral-good if no lending activity
  if (lenderBorrowCount > 0) {
    const repaymentRatio = lenderRepayCount / lenderBorrowCount;
    debtBehaviorScore = Math.max(0, Math.min(100, repaymentRatio * 70 + (lenderBorrowCount <= 3 ? 30 : Math.max(0, 30 - (lenderBorrowCount - 3) * 5))));
  }

  // ── Factor 4: Account Longevity (15%) ──────────────────────
  const firstTxDate = new Date(txs[0].transaction_date);
  const monthsOfHistory = Math.max(1, Math.round((Date.now() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const longevityScore = Math.min(100, (monthsOfHistory / 6) * 100);

  // ── Factor 5: Fraud/Risk Flags (10%) ────────────────────────
  const { rows: [fraudStats] } = await query(
    `SELECT COUNT(*) as alert_count FROM fraud_alerts WHERE user_id = $1 AND resolved = FALSE`,
    [userId]
  ).catch(() => ({ rows: [{ alert_count: 0 }] }));
  const unresolvedAlerts = parseInt(fraudStats?.alert_count || 0);
  const riskScore = Math.max(0, 100 - unresolvedAlerts * 20);

  // ── Weighted Composite ──────────────────────────────────────
  const composite =
    incomeStabilityScore * 0.30 +
    spendingDisciplineScore * 0.25 +
    debtBehaviorScore * 0.20 +
    longevityScore * 0.15 +
    riskScore * 0.10;

  // Map 0-100 composite to 300-850 FICO-style range
  const score = Math.round(300 + (composite / 100) * 550);

  const grade = score >= 740 ? 'Excellent' : score >= 670 ? 'Good' : score >= 580 ? 'Fair' : score >= 500 ? 'Poor' : 'Very Poor';

  // Recommended loan limit — conservative multiple of avg monthly income, adjusted by score
  const scoreMultiplier = score >= 740 ? 3.5 : score >= 670 ? 2.5 : score >= 580 ? 1.5 : score >= 500 ? 0.8 : 0.3;
  const recommendedLimit = Math.round((avgIncome * scoreMultiplier) / 1000) * 1000;

  return {
    score,
    grade,
    avgMonthlyIncome: Math.round(avgIncome),
    incomeTrendPct: Math.round(incomeTrend),
    savingsRate: Math.round(savingsRate),
    monthsOfHistory,
    recommendedLimit,
    factors: [
      { name: 'Income Stability', weight: 30, score: Math.round(incomeStabilityScore), detail: `${monthsWithIncome} months with income recorded` },
      { name: 'Spending Discipline', weight: 25, score: Math.round(spendingDisciplineScore), detail: `${Math.round(savingsRate)}% average savings rate` },
      { name: 'Debt & Obligation Behaviour', weight: 20, score: Math.round(debtBehaviorScore), detail: lenderBorrowCount > 0 ? `${lenderRepayCount}/${lenderBorrowCount} repayment ratio on tracked loans` : 'No lending activity detected' },
      { name: 'Account Longevity', weight: 15, score: Math.round(longevityScore), detail: `${monthsOfHistory} months of M-Pesa history` },
      { name: 'Fraud & Risk Flags', weight: 10, score: Math.round(riskScore), detail: unresolvedAlerts > 0 ? `${unresolvedAlerts} unresolved fraud alert(s)` : 'No active fraud flags' },
    ],
  };
};

// ─── CONSUMER ENDPOINTS ─────────────────────────────────────
router.get('/score', authenticate, async (req, res) => {
  try {
    const result = await calculateCreditScore(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Credit score error:', err);
    res.status(500).json({ error: 'Failed to calculate credit score' });
  }
});

router.get('/report', authenticate, async (req, res) => {
  try {
    const result = await calculateCreditScore(req.user.id);
    const { rows: [user] } = await query(`SELECT name, email FROM users WHERE id = $1`, [req.user.id]);
    res.json({ ...result, user: { name: user.name, email: user.email }, generatedAt: new Date().toISOString(), reportId: `PMC-${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
export { calculateCreditScore };