import express from 'express';
const router = express.Router();
import { query } from './pool.js';

// ─── National overview stats ────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        (SELECT COUNT(*) FROM fraud_numbers) as total_flagged_numbers,
        (SELECT COUNT(*) FROM fraud_reports) as total_reports,
        (SELECT COUNT(*) FROM fraud_reports WHERE created_at >= NOW() - INTERVAL '30 days') as reports_last_30d,
        (SELECT COALESCE(SUM(amount_lost), 0) FROM fraud_reports) as total_amount_reported,
        (SELECT COUNT(*) FROM sms_analyses WHERE scam_detected = TRUE) as sms_scams_caught,
        (SELECT COUNT(DISTINCT reporter_id) FROM fraud_reports WHERE reporter_id IS NOT NULL) as unique_contributors,
        (SELECT COUNT(*) FROM number_lookups) as total_checks_performed
    `);
    res.json({ stats, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('PFIN overview error:', err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// ─── Monthly trend (last 6 months) ──────────────────────
router.get('/trend', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') as month,
        date_trunc('month', created_at) as month_sort,
        COUNT(*) as report_count,
        COALESCE(SUM(amount_lost), 0) as amount_lost
      FROM fraud_reports
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY date_trunc('month', created_at)
      ORDER BY month_sort ASC
    `);
    res.json({ trend: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

// ─── Top scam types (reuse existing logic, public) ──────
router.get('/top-scams', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT scam_type, COUNT(*) as count, COALESCE(SUM(amount_lost), 0) as total_lost
      FROM fraud_reports
      GROUP BY scam_type
      ORDER BY count DESC
      LIMIT 8
    `);
    res.json({ scams: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch top scams' });
  }
});

// ─── Auto-generated monthly report (text, shareable) ────
router.get('/monthly-report', async (req, res) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        (SELECT COUNT(*) FROM fraud_reports WHERE created_at >= NOW() - INTERVAL '30 days') as reports_30d,
        (SELECT COALESCE(SUM(amount_lost),0) FROM fraud_reports WHERE created_at >= NOW() - INTERVAL '30 days') as amount_30d,
        (SELECT COUNT(*) FROM fraud_numbers WHERE first_reported_at >= NOW() - INTERVAL '30 days') as new_numbers_30d
    `);
    const { rows: topScam } = await query(`
      SELECT scam_type, COUNT(*) as count FROM fraud_reports
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY scam_type ORDER BY count DESC LIMIT 1
    `);
    const monthLabel = new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
    const topScamLabel = topScam[0]?.scam_type?.replace(/_/g, ' ') || 'no dominant pattern';

    const reportText = `PESAMIND FRAUD INTELLIGENCE NETWORK — MONTHLY BRIEF
${monthLabel}

In the last 30 days, PesaMind's community fraud network recorded ${stats.reports_30d} fraud reports from Kenyans nationwide, identifying ${stats.new_numbers_30d} new fraud numbers. Reported losses totalled approximately KSH ${Number(stats.amount_30d).toLocaleString()}. The most common scam type this period was "${topScamLabel}".

This data is sourced entirely from community reports submitted via PesaMind's Fraud Shield (pesamind.online/shield) and is updated continuously.

— PesaMind Fraud Intelligence Network (PFIN)
pesamind.online/pfin`;

    res.json({ report: reportText, monthLabel, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;