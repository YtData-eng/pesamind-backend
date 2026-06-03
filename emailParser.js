import express from 'express';
import { query } from './pool.js';

const router = express.Router();

// ─── Parse M-Pesa transaction from email body ────────────────────
const parseMpesaEmail = (body) => {
  const transactions = [];

  // M-Pesa email patterns
  const patterns = [
    // Sent money: "You have sent Ksh1,000.00 to JOHN DOE on 1/6/26"
    {
      regex: /You have sent Ksh([\d,]+\.?\d*) to (.+?) on (\d+\/\d+\/\d+)/gi,
      type: 'send'
    },
    // Received money: "You have received Ksh500.00 from JANE DOE on 1/6/26"
    {
      regex: /You have received Ksh([\d,]+\.?\d*) from (.+?) on (\d+\/\d+\/\d+)/gi,
      type: 'receive'
    },
    // Buy goods: "Ksh200.00 paid to NAIVAS on 1/6/26"
    {
      regex: /Ksh([\d,]+\.?\d*) paid to (.+?) on (\d+\/\d+\/\d+)/gi,
      type: 'payment'
    },
    // Withdraw: "You have withdrawn Ksh2,000.00 from Agent on 1/6/26"
    {
      regex: /You have withdrawn Ksh([\d,]+\.?\d*) from (.+?) on (\d+\/\d+\/\d+)/gi,
      type: 'withdraw'
    },
    // Airtime: "You bought Ksh50.00 of airtime on 1/6/26"
    {
      regex: /You bought Ksh([\d,]+\.?\d*) of airtime on (\d+\/\d+\/\d+)/gi,
      type: 'airtime'
    },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(body)) !== null) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      const description = match[2] || 'Airtime';
      const dateStr = type === 'airtime' ? match[2] : match[3];

      transactions.push({
        amount,
        type,
        description: description.trim(),
        transaction_date: new Date(dateStr),
        source: 'email',
      });
    }
  }

  return transactions;
};

// ─── Postmark Inbound Webhook ────────────────────────────────────
router.post('/inbound', async (req, res) => {
  try {
    const { From, TextBody, HtmlBody, Subject } = req.body;

    console.log('📧 Inbound email from:', From);
    console.log('Subject:', Subject);

    // Find user by email
    const { rows: users } = await query(
      'SELECT id FROM users WHERE email = $1',
      [From.toLowerCase().trim()]
    );

    if (!users.length) {
      console.log('No user found for email:', From);
      return res.status(200).json({ message: 'User not found, ignoring' });
    }

    const userId = users[0].id;
    const body = TextBody || HtmlBody || '';

    // Parse transactions from email
    const transactions = parseMpesaEmail(body);

    if (!transactions.length) {
      console.log('No transactions found in email');
      return res.status(200).json({ message: 'No transactions parsed' });
    }

    // Save each transaction
    let saved = 0;
    for (const tx of transactions) {
      await query(
        `INSERT INTO transactions 
          (user_id, amount, type, description, transaction_date, category, source)
         VALUES ($1, $2, $3, $4, $5, 'other', $6)
         ON CONFLICT DO NOTHING`,
        [userId, tx.amount, tx.type, tx.description, tx.transaction_date, tx.source]
      );
      saved++;
    }

    console.log(`✅ Saved ${saved} transactions for user ${userId}`);
    res.status(200).json({ message: `Parsed ${saved} transactions` });

  } catch (err) {
    console.error('Email parse error:', err);
    // Always return 200 to Postmark so it doesn't retry
    res.status(200).json({ error: 'Parse failed' });
  }
});

export default router;