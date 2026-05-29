import express from 'express';
const router = express.Router();
import fs from 'fs';
import pdf from 'pdf-parse';
import { query } from './pool.js';
import { parseMpesaText, parseMpesaCsv } from './services/mpesaParser.js';
import { categorizeTransactions, analyzeTransactionFraud } from './services/aiService.js';
import multer from 'multer';import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('PDF files only'));
  }
});

export const uploadStatement = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { originalname, size, mimetype } = req.file;
const userId = req.user.userId || req.user.id;
const { rows: [statement] } = await query(
  `INSERT INTO statements (user_id, filename, original_name, file_size, status)
   VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
  [userId, originalname, originalname, size]
);

    // Process async (don't block response)
    processStatement(statement, req.file, userId).catch(console.error);

    res.status(202).json({
      message: 'Statement uploaded. Processing in background.',
      statementId: statement.id,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

const processStatement = async (statement, file, userId) => {
  try {
    let rawTransactions = [];
    const filePath = file.path;

    if (file.mimetype === 'application/pdf') {
      const dataBuffer = file.buffer;
      const pdfData = await pdf(dataBuffer);
console.log('PDF text sample:', pdfData.text.substring(0, 500));
await query(`UPDATE statements SET raw_text = $1 WHERE id = $2`, [pdfData.text.substring(0, 50000), statement.id]);
rawTransactions = parseMpesaText(pdfData.text);
console.log('Parsed transactions:', rawTransactions.length);
    } else if (file.mimetype === 'text/csv') {
      const csvText = fs.readFileSync(filePath, 'utf-8');
      rawTransactions = parseMpesaCsv(csvText);
    }

    if (!rawTransactions.length) {
      await query(`UPDATE statements SET status = 'failed' WHERE id = $1`, [statement.id]);
      return;
    }

    // AI categorization (batch)
    const categorized = await categorizeTransactions(rawTransactions);
    const categoryMap = Object.fromEntries(categorized.map((c) => [c.id, c.category]));

    // Save transactions
    for (const txn of rawTransactions) {
      const category = categoryMap[txn.transaction_id] || 'other';

      // Fraud detection for large or suspicious transactions
      let isFlagged = false;
      let flagReason = null;

      if (txn.amount >= 10000 || /prize|won|agent|fee|urgent/i.test(txn.description)) {
        const fraud = await analyzeTransactionFraud(txn);
        if (fraud.risk_level === 'high' || fraud.risk_level === 'medium') {
          isFlagged = true;
          flagReason = fraud.reason;

          await query(
            `INSERT INTO fraud_reports (user_id, transaction_id, risk_level, reason, ai_analysis)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, null, fraud.risk_level, fraud.reason, fraud.ai_analysis]
          );
        }
      }

      await query(
        `INSERT INTO transactions 
         (user_id, statement_id, transaction_id, type, amount, balance, counterparty, 
          description, category, is_flagged, flag_reason, transaction_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING`,
        [
          userId, statement.id, txn.transaction_id, txn.type, txn.amount,
          txn.balance, txn.counterparty, txn.description, category,
          isFlagged, flagReason, txn.transaction_date,
        ]
      );
    }

    // Mark statement as done
  const firstDate = rawTransactions[0]?.transaction_date;
const month = firstDate ? new Date(firstDate).getMonth() + 1 : null;
const year = firstDate ? new Date(firstDate).getFullYear() : null;
await query(
  `UPDATE statements SET status = 'done', month = $1, year = $2, transaction_count = $3 WHERE id = $4`,
  [month, year, rawTransactions.length, statement.id]
);
  } catch (err) {
    console.error('Processing error:', err);
    await query(`UPDATE statements SET status = 'failed' WHERE id = $1`, [statement.id]);
  }
};

export const getStatements = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM statements WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ statements: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statements' });
  }
};

export const getStatementStatus = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, status, original_name, month, created_at FROM statements 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Statement not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status' });
  }
};
router.post('/upload', authenticate, upload.single('statement'), uploadStatement);
router.get('/', authenticate, getStatements);
router.get('/:id/status', authenticate, getStatementStatus);

export default router;