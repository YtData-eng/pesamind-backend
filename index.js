import { config } from 'dotenv';
config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authController from './authController.js';
import analyticsController from './analyticsController.js';
import statementController from './statementController.js';
import fraudController from './fraud.js';
import adminController from './admin.js';
import billingController from './billing.js';
import fraudShieldController from './fraudShield.js';
import referralController from './referral.js';
import developerPlatform from './developerPlatform.js';
import creditScoreController from './creditScore.js';
import pfinController from './pfin.js';
import corporateController from './corporate.js';

const app = express();

// Trust Render's proxy layer so X-Forwarded-For is parsed correctly
app.set('trust proxy', 1);

app.use(helmet());

// Single, correct CORS config — applied once, before all routes
app.use(cors({
  origin: [
    'https://pesamind.online',
    'https://www.pesamind.online',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PesaMind API is running' });
});

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use('/api/auth', authController);
app.use('/api/analytics', analyticsController);
app.use('/api/statements', statementController);
app.use('/api/fraud', fraudController);
app.use('/api/admin', adminController);
app.use('/api/billing', billingController);
app.use('/api/shield', fraudShieldController);
app.use('/api/referral', referralController);
app.use('/api/dev', developerPlatform);
app.use('/api/credit', creditScoreController);
app.use('/api/pfin', pfinController);
app.use('/api/corporate', corporateController);

app.get('/health', (req, res) => res.json({ status: 'OK', service: 'PesaMind API' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`PesaMind API running on port ${PORT}`));