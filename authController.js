import express from 'express';
const router = express.Router();
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from './pool.js';

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

export const register = async (req, res) => {
  try {
    
    const { name, full_name, email, password, phone, phone_number } = req.body;
const userName = name || full_name;
const userPhone = phone || phone_number;

    // Check existing
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = uuidv4();

    const { rows } = await query(
  `INSERT INTO users (name, email, password_hash, phone, verification_token)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING id, name, email, phone, is_verified, created_at`,
  [userName, email, password_hash, userPhone || null, verification_token]
);

    const user = rows[0];
    const token = signToken(user.id);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, name, email, phone, password_hash, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    const { password_hash, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const getMe = async (req, res) => {
  res.json({ user: req.user });
};
router.post('/register', register);
router.post('/login', login);
router.get('/me', getMe);
router.get('/trend', authenticate, getMonthlyTrend);


export const getMonthlyTrend = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(transaction_date, 'Mon YY') as label,
        EXTRACT(YEAR FROM transaction_date) as year,
        EXTRACT(MONTH FROM transaction_date) as month,
        COALESCE(SUM(CASE WHEN type IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type NOT IN ('receive','deposit','salary') THEN amount ELSE 0 END), 0) as expenses
      FROM transactions
      WHERE user_id = $1
      AND transaction_date >= NOW() - INTERVAL '6 months'
      GROUP BY label, year, month
      ORDER BY year, month ASC
    `, [req.user.id]);
    res.json({ trend: rows });
  } catch (err) {
    console.error('Trend error:', err);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
};

export default router;