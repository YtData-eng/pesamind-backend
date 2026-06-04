import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from './pool.js';

const router = express.Router();

// ─── Token Helper ───────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );

// ─── Register ───────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, full_name, email, password, phone, phone_number } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userName = name || full_name;
    const userPhone = phone || phone_number || null;

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
      [userName, email, password_hash, userPhone, verification_token]
    );

    const user = rows[0];
    const token = signToken(user);

    // Send welcome email (non-blocking)
import { sendWelcomeEmail } from './services/emailService.js';
sendWelcomeEmail(email, userName).catch(console.error);
res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// ─── Login ──────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

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

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ─── Get Current User ───────────────────────────────────────────
export const getMe = async (req, res) => {
  res.json({ user: req.user });
};

// ─── Debug Token (REMOVE AFTER FIXING ADMIN ACCESS) ─────────────
router.get('/debug-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ decoded });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ─── Routes ─────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);
router.get('/me', getMe);
  
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.json({ message: 'If that email exists, a reset link was sent' });

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await query(
      `UPDATE users SET verification_token = $1, updated_at = NOW() WHERE email = $2`,
      [token, email]
    );

    // For now just return the token (in production send email)
    res.json({ message: 'Reset token generated', token, note: 'In production this would be emailed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const { rows } = await query('SELECT id FROM users WHERE verification_token = $1', [token]);
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const password_hash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users SET password_hash = $1, verification_token = NULL WHERE verification_token = $2`,
      [password_hash, token]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


export default router;