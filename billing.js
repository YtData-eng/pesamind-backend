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

// ─── Get Current Plan ────────────────────────────────────────────
router.get('/plan', authenticate, async (req, res) => {
  try {
    const { rows: [user] } = await query(
      `SELECT plan, plan_expires_at, mpesa_phone FROM users WHERE id = $1`,
      [req.user.id]
    );

    const isActive = user.plan === 'pro' &&
      (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date());

    res.json({
      plan: isActive ? 'pro' : 'free',
      expires_at: user.plan_expires_at,
      is_pro: isActive,
      limits: isActive ? {
        uploads: 'unlimited',
        transactions: 'unlimited',
        ai_summaries: 'unlimited',
        budget_categories: 'unlimited',
      } : {
        uploads: 1,
        transactions: 500,
        ai_summaries: 1,
        budget_categories: 3,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

// ─── Initiate M-Pesa STK Push ────────────────────────────────────
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '254').replace(/^254254/, '254');

    // Get M-Pesa access token
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    });
    const { access_token } = await tokenRes.json();

    // STK Push
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const stkRes = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: 299,
        PartyA: cleanPhone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: cleanPhone,
        CallBackURL: `${process.env.BACKEND_URL}/api/billing/callback`,
        AccountReference: 'PesaMind Pro',
        TransactionDesc: 'PesaMind Pro Monthly Subscription'
      })
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode === '0') {
      await query(
        `INSERT INTO payments (user_id, amount, phone, checkout_request_id, status)
         VALUES ($1, 299, $2, $3, 'pending')`,
        [req.user.id, cleanPhone, stkData.CheckoutRequestID]
      );
      await query(`UPDATE users SET mpesa_phone = $1 WHERE id = $2`, [cleanPhone, req.user.id]);

      res.json({
        message: 'STK Push sent! Check your phone to complete payment.',
        checkout_request_id: stkData.CheckoutRequestID
      });
    } else {
      res.status(400).json({ error: stkData.errorMessage || 'STK Push failed' });
    }
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// ─── M-Pesa Callback ─────────────────────────────────────────────
router.post('/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body;
    const { CheckoutRequestID, ResultCode, CallbackMetadata } = stkCallback;

    if (ResultCode === 0) {
      const items = CallbackMetadata?.Item || [];

      // FIXED: removed TypeScript syntax (i: any)
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      await query(
        `UPDATE payments SET status = 'completed', mpesa_receipt = $1 WHERE checkout_request_id = $2`,
        [receipt, CheckoutRequestID]
      );

      const { rows: [payment] } = await query(
        `SELECT user_id FROM payments WHERE checkout_request_id = $1`,
        [CheckoutRequestID]
      );

      if (payment) {
        await query(
          `UPDATE users SET plan = 'pro', plan_expires_at = NOW() + INTERVAL '30 days' WHERE id = $1`,
          [payment.user_id]
        );
        console.log(`✅ Pro activated for user ${payment.user_id}`);
      }
    } else {
      await query(
        `UPDATE payments SET status = 'failed' WHERE checkout_request_id = $1`,
        [CheckoutRequestID]
      );
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).json({ error: 'Callback failed' });
  }
});

// ─── Check Payment Status ────────────────────────────────────────
router.get('/status/:checkoutId', authenticate, async (req, res) => {
  try {
    const { rows: [payment] } = await query(
      `SELECT status, mpesa_receipt FROM payments WHERE checkout_request_id = $1 AND user_id = $2`,
      [req.params.checkoutId, req.user.id]
    );
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ─── Payment History ─────────────────────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT amount, phone, mpesa_receipt, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ payments: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── Manual Upgrade (for testing) ───────────────────────────────
router.post('/upgrade-manual', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE users SET plan = 'pro', plan_expires_at = NOW() + INTERVAL '30 days' WHERE id = $1`,
      [req.user.id]
    );
    res.json({ message: 'Upgraded to Pro for 30 days!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upgrade' });
  }
});

export default router;