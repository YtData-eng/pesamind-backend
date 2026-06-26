import { query } from './pool.js';

const migrate = async () => {
  console.log('🔄 Running migrations...');

  await query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      is_verified BOOLEAN DEFAULT FALSE,
      verification_token VARCHAR(255),
      reset_token VARCHAR(255),
      reset_token_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- M-Pesa Statements (uploaded files)
    CREATE TABLE IF NOT EXISTS statements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_size INTEGER,
      status VARCHAR(50) DEFAULT 'processing', -- processing | done | failed
      month VARCHAR(7), -- e.g. 2024-06
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Transactions (parsed from statements)
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      statement_id UUID REFERENCES statements(id) ON DELETE CASCADE,
      transaction_id VARCHAR(100),
      type VARCHAR(50),           -- send_money | receive | buy_goods | pay_bill | withdraw | deposit | airtime
      amount NUMERIC(12, 2) NOT NULL,
      balance NUMERIC(12, 2),
      counterparty VARCHAR(255),  -- name of sender/recipient
      description TEXT,
      category VARCHAR(100),      -- AI-assigned: food | transport | utilities | etc.
      is_flagged BOOLEAN DEFAULT FALSE,
      flag_reason TEXT,
      transaction_date TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Budgets
    CREATE TABLE IF NOT EXISTS budgets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(100) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      month VARCHAR(7) NOT NULL, -- e.g. 2024-06
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, category, month)
    );

    -- Budget Alerts
    CREATE TABLE IF NOT EXISTS budget_alerts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE,
      alert_type VARCHAR(50), -- warning_80 | exceeded
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Fraud / Scam Reports
    CREATE TABLE IF NOT EXISTS fraud_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
      risk_level VARCHAR(20), -- low | medium | high
      reason TEXT,
      ai_analysis TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Monthly Summaries
    CREATE TABLE IF NOT EXISTS monthly_summaries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      month VARCHAR(7) NOT NULL,
      total_income NUMERIC(12, 2) DEFAULT 0,
      total_expenses NUMERIC(12, 2) DEFAULT 0,
      top_categories JSONB,
      ai_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_statements_user ON statements(user_id);
  `);

  console.log('✅ Migrations complete');
  process.exit(0);
};

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
