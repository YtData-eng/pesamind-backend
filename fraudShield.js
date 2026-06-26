import express from 'express';
const router = express.Router();
import { query } from './pool.js';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';

const getAI = () => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
});

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

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      req.user = { id: decoded.userId || decoded.id };
    } catch (e) {}
  }
  next();
};

// ─── SCAM TYPE DEFINITIONS ────────────────────────────────
const SCAM_TYPES = {
  reversal_scam: {
    label: 'Reversal Scam',
    description: 'Scammer sends money then asks you to reverse it',
    keywords: ['reverse', 'reversal', 'sent by mistake', 'wrong number', 'please send back', 'nilikutumia kwa makosa'],
    severity: 'high',
    advice: 'Never send money back to strangers. Contact Safaricom directly if someone claims a reversal.',
  },
  fake_safaricom: {
    label: 'Fake Safaricom Agent',
    description: 'Scammer impersonates Safaricom to steal your credentials',
    keywords: ['safaricom agent', 'line will be deactivated', 'send code', 'mpesa pin', 'account suspended', 'verify your line', 'sim registration'],
    severity: 'critical',
    advice: 'Safaricom will NEVER ask for your PIN or OTP. Hang up immediately.',
  },
  job_scam: {
    label: 'Fake Job Offer',
    description: 'Fake job requiring registration or deposit fee',
    keywords: ['job offer', 'employment', 'salary', 'registration fee', 'deposit', 'interview fee', 'training fee', 'hr department'],
    severity: 'high',
    advice: 'Legitimate employers never ask for money upfront. Verify the company independently.',
  },
  lottery_prize: {
    label: 'Lottery/Prize Scam',
    description: 'Fake prize requiring processing fee to claim',
    keywords: ['you have won', 'winner', 'prize', 'lottery', 'processing fee', 'claim your prize', 'congratulations you won', 'umeshinda'],
    severity: 'critical',
    advice: 'You cannot win a lottery you never entered. Ignore all such messages.',
  },
  betting_scam: {
    label: 'Betting/Prediction Scam',
    description: 'Fake insider betting tips requiring payment',
    keywords: ['sure odds', 'insider tips', 'guaranteed win', 'fixed match', 'betting tips', 'send fee', 'prediction'],
    severity: 'medium',
    advice: 'No one can guarantee betting wins. These are always scams.',
  },
  family_emergency: {
    label: 'Family Emergency Scam',
    description: 'Scammer impersonates family member in distress',
    keywords: ['mum', 'dad', 'emergency', 'hospital', 'accident', 'new number', 'phone broke', 'urgent', 'please help me'],
    severity: 'high',
    advice: 'Always call the family member directly on their known number to verify.',
  },
  investment_scam: {
    label: 'Investment/Ponzi Scheme',
    description: 'Fake investment promising unrealistic returns',
    keywords: ['invest', 'returns', 'profit', 'double your money', 'guaranteed returns', 'investment opportunity', '100%', '200%'],
    severity: 'critical',
    advice: 'Guaranteed high returns are always scams. Never invest money you cannot afford to lose.',
  },
  supplier_scam: {
    label: 'Fake Supplier Scam',
    description: 'Fake business supplier who disappears after payment',
    keywords: ['wholesale', 'supplier', 'stock', 'goods', 'delivery', 'pay first', 'send payment', 'business deal'],
    severity: 'high',
    advice: 'Always verify suppliers physically before paying. Use PesaMind supplier verification.',
  },
};

// ─── RISK SCORE CALCULATOR ────────────────────────────────
const calculateRiskScore = (reportCount, scamType, recentReports) => {
  let score = 0;
  score += Math.min(reportCount * 15, 60);
  if (scamType === 'critical') score += 30;
  else if (scamType === 'high') score += 20;
  else if (scamType === 'medium') score += 10;
  if (recentReports > 5) score += 10;
  return Math.min(score, 100);
};

// ─── PUBLIC: Check a phone number ─────────────────────────
router.get('/check/:phone', optionalAuth, async (req, res) => {
  try {
    let phone = req.params.phone.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '');

    // Log the lookup
    await query(`INSERT INTO number_lookups (phone_number, ip_address) VALUES ($1, $2)`,
      [phone, req.ip]).catch(() => {});

    const { rows: [fraudData] } = await query(
      `SELECT * FROM fraud_numbers WHERE phone_number = $1`, [phone]
    );

    const { rows: reports } = await query(
      `SELECT scam_type, description, created_at FROM fraud_reports
       WHERE phone_number = $1 AND status != 'dismissed'
       ORDER BY created_at DESC LIMIT 5`, [phone]
    );

    const { rows: [recentCount] } = await query(
      `SELECT COUNT(*) as count FROM fraud_reports
       WHERE phone_number = $1 AND created_at >= NOW() - INTERVAL '7 days'`, [phone]
    );

    if (!fraudData) {
      return res.json({
        phone,
        status: 'clean',
        risk_score: 0,
        risk_level: 'safe',
        message: 'No fraud reports found for this number',
        report_count: 0,
        reports: [],
      });
    }

    const riskLevel = fraudData.risk_score >= 80 ? 'critical' :
                      fraudData.risk_score >= 60 ? 'high' :
                      fraudData.risk_score >= 40 ? 'medium' : 'low';

    const scamInfo = SCAM_TYPES[fraudData.scam_type] || {};

    res.json({
      phone,
      status: 'flagged',
      risk_score: fraudData.risk_score,
      risk_level: riskLevel,
      report_count: fraudData.report_count,
      scam_type: fraudData.scam_type,
      scam_label: scamInfo.label || 'Unknown Scam',
      scam_description: scamInfo.description || '',
      advice: scamInfo.advice || 'Proceed with extreme caution.',
      first_reported: fraudData.first_reported_at,
      last_reported: fraudData.last_reported_at,
      recent_reports_7d: parseInt(recentCount.count),
      reports: reports.map(r => ({
        scam_type: r.scam_type,
        description: r.description,
        date: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Number check error:', err);
    res.status(500).json({ error: 'Failed to check number' });
  }
});

// ─── PUBLIC: Report a fraud number ────────────────────────
router.post('/report', optionalAuth, async (req, res) => {
  try {
    const { phone_number, scam_type, description, amount_lost } = req.body;
    if (!phone_number || !scam_type) {
      return res.status(400).json({ error: 'Phone number and scam type required' });
    }

    let phone = phone_number.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '');

    // Save the report
    await query(
      `INSERT INTO fraud_reports (reporter_id, phone_number, scam_type, description, amount_lost)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user?.id || null, phone, scam_type, description, amount_lost || 0]
    );

    // Update or create fraud number entry
    const scamInfo = SCAM_TYPES[scam_type] || {};
    const { rows: [existing] } = await query(
      `SELECT * FROM fraud_numbers WHERE phone_number = $1`, [phone]
    );

    if (existing) {
      const newCount = existing.report_count + 1;
      const newScore = calculateRiskScore(newCount, scamInfo.severity, 0);
      await query(
        `UPDATE fraud_numbers SET report_count = $1, risk_score = $2,
         last_reported_at = NOW(), scam_type = $3 WHERE phone_number = $4`,
        [newCount, newScore, scam_type, phone]
      );
    } else {
      const score = calculateRiskScore(1, scamInfo.severity, 0);
      await query(
        `INSERT INTO fraud_numbers (phone_number, report_count, risk_score, scam_type)
         VALUES ($1, 1, $2, $3)`,
        [phone, score, scam_type]
      );
    }

    res.json({
      success: true,
      message: 'Thank you! Your report helps protect all Kenyans 🇰🇪',
      phone,
      scam_type,
    });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// ─── AI: Analyse suspicious SMS ───────────────────────────
router.post('/analyse-sms', optionalAuth, async (req, res) => {
  try {
    const { sms_text } = req.body;
    if (!sms_text) return res.status(400).json({ error: 'SMS text required' });

    // First do keyword detection
    let detectedScam = null;
    let maxMatches = 0;

    for (const [type, info] of Object.entries(SCAM_TYPES)) {
      const matches = info.keywords.filter(kw =>
        sms_text.toLowerCase().includes(kw.toLowerCase())
      ).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedScam = { type, ...info, keyword_matches: matches };
      }
    }

    // Then use AI for deeper analysis
    const prompt = `You are Kenya's top fraud detection expert. Analyse this SMS for scam patterns.

SMS: "${sms_text}"

Known Kenyan scam types: reversal_scam, fake_safaricom, job_scam, lottery_prize, betting_scam, family_emergency, investment_scam, supplier_scam

Respond ONLY with JSON:
{
  "is_scam": true/false,
  "scam_type": "type or null",
  "confidence": 0-100,
  "red_flags": ["flag1", "flag2"],
  "explanation": "brief explanation in plain English",
  "advice": "what the recipient should do",
  "severity": "critical/high/medium/low/none"
}`;

    let aiAnalysis = null;
    try {
      const res2 = await getAI().chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 500,
      });
      aiAnalysis = JSON.parse(res2.choices[0].message.content);
    } catch (e) {
      console.error('AI SMS analysis error:', e.message);
    }

    const isScam = aiAnalysis?.is_scam || maxMatches > 0;
    const scamType = aiAnalysis?.scam_type || detectedScam?.type || null;
    const confidence = aiAnalysis?.confidence || (maxMatches > 0 ? maxMatches * 25 : 0);
    const scamInfo = SCAM_TYPES[scamType] || {};

    // Save analysis
    await query(
      `INSERT INTO sms_analyses (user_id, sms_text, scam_detected, scam_type, confidence_score, explanation)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user?.id || null, sms_text, isScam, scamType, confidence, aiAnalysis?.explanation || '']
    ).catch(() => {});

    res.json({
      is_scam: isScam,
      scam_type: scamType,
      scam_label: scamInfo.label || null,
      confidence,
      severity: aiAnalysis?.severity || scamInfo.severity || 'none',
      red_flags: aiAnalysis?.red_flags || [],
      explanation: aiAnalysis?.explanation || (isScam ? 'This message matches known scam patterns.' : 'No scam patterns detected.'),
      advice: aiAnalysis?.advice || scamInfo.advice || 'Stay vigilant and never send money to strangers.',
      keyword_matches: maxMatches,
    });
  } catch (err) {
    console.error('SMS analysis error:', err);
    res.status(500).json({ error: 'Failed to analyse SMS' });
  }
});

// ─── Supplier Verification ────────────────────────────────
router.get('/verify-supplier/:phone', optionalAuth, async (req, res) => {
  try {
    let phone = req.params.phone.replace(/\s/g, '').replace(/^0/, '254').replace(/^\+/, '');

    const { rows: [supplier] } = await query(
      `SELECT * FROM supplier_verifications WHERE phone_number = $1`, [phone]
    );

    const { rows: [fraudCheck] } = await query(
      `SELECT * FROM fraud_numbers WHERE phone_number = $1`, [phone]
    );

    const { rows: txHistory } = await query(
      `SELECT COUNT(*) as tx_count, COALESCE(SUM(amount), 0) as total_amount
       FROM transactions WHERE counterparty LIKE $1
       AND type NOT IN ('receive','deposit','salary')`,
      [`%${phone}%`]
    );

    const txCount = parseInt(txHistory[0]?.tx_count) || 0;
    const totalPaid = parseFloat(txHistory[0]?.total_amount) || 0;

    let riskLevel = 'unknown';
    let verdict = 'No payment history found for this number.';
    let safe = null;

    if (fraudCheck && fraudCheck.report_count > 0) {
      riskLevel = 'dangerous';
      safe = false;
      verdict = `⚠️ DANGER: This number has been reported ${fraudCheck.report_count} times for fraud (${fraudCheck.scam_type?.replace(/_/g, ' ')}).`;
    } else if (txCount >= 10) {
      riskLevel = 'trusted';
      safe = true;
      verdict = `✅ Trusted supplier: ${txCount} payments made, KSH ${totalPaid.toLocaleString()} total transacted.`;
    } else if (txCount >= 3) {
      riskLevel = 'moderate';
      safe = null;
      verdict = `⚠️ Some history: ${txCount} payments made. Proceed with reasonable caution.`;
    } else if (txCount === 0) {
      riskLevel = 'unknown';
      safe = false;
      verdict = `❓ Unknown supplier: No payment history. First-time transaction carries risk.`;
    }

    res.json({
      phone,
      risk_level: riskLevel,
      safe,
      verdict,
      transaction_count: txCount,
      total_paid: totalPaid,
      fraud_reports: fraudCheck?.report_count || 0,
      supplier_info: supplier || null,
    });
  } catch (err) {
    console.error('Supplier verification error:', err);
    res.status(500).json({ error: 'Failed to verify supplier' });
  }
});

// ─── Family Verification Code ─────────────────────────────
router.post('/family-code', authenticate, async (req, res) => {
  try {
    const { code, hint } = req.body;
    if (!code || code.length < 4) return res.status(400).json({ error: 'Code must be at least 4 characters' });

    await query(
      `INSERT INTO family_codes (user_id, code, hint)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET code = $2, hint = $3, updated_at = NOW()`,
      [req.user.id, code.toUpperCase(), hint || '']
    );

    res.json({ success: true, message: 'Family verification code saved! Share this code only with trusted family members.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save family code' });
  }
});

router.get('/family-code', authenticate, async (req, res) => {
  try {
    const { rows: [code] } = await query(
      `SELECT code, hint, updated_at FROM family_codes WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ code: code || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch family code' });
  }
});

router.post('/verify-family-code', async (req, res) => {
  try {
    const { user_id, code } = req.body;
    const { rows: [stored] } = await query(
      `SELECT code FROM family_codes WHERE user_id = $1`, [user_id]
    );
    if (!stored) return res.json({ valid: false, message: 'No family code set for this user' });
    res.json({ valid: stored.code === code.toUpperCase(), message: stored.code === code.toUpperCase() ? '✅ Code verified — this is really your family member!' : '❌ Wrong code — this may be a scammer!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// ─── Chama Group Management ───────────────────────────────
router.post('/chama', authenticate, async (req, res) => {
  try {
    const { name, monthly_contribution, treasurer_phone, alert_threshold } = req.body;
    const { rows: [chama] } = await query(
      `INSERT INTO chama_groups (name, created_by, monthly_contribution, treasurer_phone, alert_threshold)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, req.user.id, monthly_contribution || 0, treasurer_phone, alert_threshold || monthly_contribution * 2]
    );
    await query(`INSERT INTO chama_members (chama_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [chama.id, req.user.id]);
    res.json({ chama });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chama' });
  }
});

router.get('/chama', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cg.*, cm.role,
        (SELECT COUNT(*) FROM chama_members WHERE chama_id = cg.id) as member_count
       FROM chama_groups cg
       JOIN chama_members cm ON cm.chama_id = cg.id AND cm.user_id = $1
       ORDER BY cg.created_at DESC`,
      [req.user.id]
    );
    res.json({ chamas: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chamas' });
  }
});

// ─── Fraud Shield Stats (Public) ─────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { rows: [stats] } = await query(`
      SELECT
        (SELECT COUNT(*) FROM fraud_numbers) as total_flagged_numbers,
        (SELECT COUNT(*) FROM fraud_reports) as total_reports,
        (SELECT COALESCE(SUM(amount_lost), 0) FROM fraud_reports) as total_amount_reported,
        (SELECT COUNT(*) FROM sms_analyses WHERE scam_detected = TRUE) as sms_scams_caught,
        (SELECT COUNT(*) FROM number_lookups) as total_lookups
    `);
    res.json({ stats: stats || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Top Scam Types ───────────────────────────────────────
router.get('/top-scams', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT scam_type, COUNT(*) as count,
        COALESCE(SUM(amount_lost), 0) as total_lost
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

// ─── Generate Police Report ───────────────────────────────
router.post('/police-report', authenticate, async (req, res) => {
  try {
    const { phone_number, scam_type, description, amount_lost, incident_date } = req.body;
    const { rows: [user] } = await query(`SELECT name, email FROM users WHERE id = $1`, [req.user.id]);

    const report = `
OFFICIAL FRAUD REPORT — GENERATED BY PESAMIND FRAUD SHIELD
═══════════════════════════════════════════════════════════

DATE OF REPORT: ${new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}
PLATFORM: PesaMind Fraud Shield (pesamind.online)

COMPLAINANT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━
Name: ${user.name}
Email: ${user.email}
Report ID: FR-${Date.now()}

INCIDENT DETAILS
━━━━━━━━━━━━━━━━
Fraud Type: ${SCAM_TYPES[scam_type]?.label || scam_type}
Suspected Scammer Number: ${phone_number}
Amount Lost: KSH ${parseFloat(amount_lost || 0).toLocaleString()}
Date of Incident: ${incident_date || 'Not specified'}

DESCRIPTION OF INCIDENT
━━━━━━━━━━━━━━━━━━━━━━━
${description}

SCAM TYPE INFORMATION
━━━━━━━━━━━━━━━━━━━━━
${SCAM_TYPES[scam_type]?.description || 'Unknown scam type'}

REPORTING CHANNELS
━━━━━━━━━━━━━━━━━━
Please submit this report to:
1. Safaricom Fraud Line: 0722 000 100
2. DCI Kenya Cybercrime Unit: 0800 722 203
3. Communications Authority: 0800 221 555
4. Banking Fraud Investigation Unit: via your bank

DECLARATION
━━━━━━━━━━━
I hereby declare that the information provided above is true and accurate to the best of my knowledge.

Generated by PesaMind Fraud Shield
pesamind.online | tracyyegon857@gmail.com
© 2026 PesaMind — Protecting Kenyans from M-Pesa Fraud
    `.trim();

    res.json({ report, user: user.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;