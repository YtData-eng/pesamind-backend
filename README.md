# PesaMind 🧠💚

> AI-powered M-Pesa financial intelligence platform for Africa

Built with **Next.js** (frontend) · **Node.js/Express** (backend) · **PostgreSQL** (database) · **OpenAI/Groq** (AI) · **Resend** (email)

---

## Project Structure

```
pesamind/
├── frontend/          # Next.js 14 app (TypeScript + Tailwind)
│   └── src/app/
│       ├── auth/      # Login & Register pages
│       └── dashboard/ # Main app (Overview, Upload, Analytics, Fraud, Budgets)
│
└── backend/           # Express API
    └── src/
        ├── controllers/   # Route handlers
        ├── services/      # AI & M-Pesa parser
        ├── db/            # PostgreSQL pool & migrations
        ├── middleware/     # JWT auth
        └── routes/        # All API routes
```

---

## Quick Start

### 1. PostgreSQL

Create a database:
```bash
psql -U postgres
CREATE DATABASE pesamind;
\q
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in .env with your keys
npm install
npm run db:migrate     # Creates all tables
npm run dev            # Starts on :5000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm install
npm run dev            # Starts on :3000
```

---

## Environment Variables

### Backend `.env`

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `OPENAI_API_KEY` | OpenAI or Groq API key |
| `OPENAI_BASE_URL` | API base URL (use `https://api.groq.com/openai/v1` for Groq) |
| `RESEND_API_KEY` | Resend email API key |
| `FRONTEND_URL` | Frontend URL for CORS (default: `http://localhost:3000`) |

> **Using Groq instead of OpenAI?** Set `OPENAI_BASE_URL=https://api.groq.com/openai/v1` and use model `llama3-8b-8192` in `aiService.js`

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Statements
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/statements/upload` | Upload M-Pesa PDF/CSV |
| GET | `/api/statements` | List all statements |
| GET | `/api/statements/:id/status` | Check processing status |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics` | Overview (income, expenses, trends) |
| GET | `/api/analytics/summary/:month` | AI monthly summary |
| GET | `/api/analytics/budgets?month=YYYY-MM` | Get budgets |
| POST | `/api/analytics/budgets` | Create/update budget |

---

## Phase 1 Features ✅

- [x] M-Pesa statement upload (PDF & CSV)
- [x] AI expense categorization (14 categories)
- [x] Spending analytics dashboard
- [x] Budget management with alerts
- [x] Fraud & scam detection
- [x] AI monthly summaries
- [x] JWT authentication
- [x] PostgreSQL with full schema

## Phase 2 Coming Next 🔜

- Trust scoring system
- Merchant verification
- AI anomaly detection
- Verified business profiles

---

## Deployment

- **Frontend** → Vercel (`vercel deploy`)
- **Backend** → Railway (`railway up`)
- **Database** → Railway PostgreSQL or Supabase

---

Built for Africa 🌍 · Powered by AI ✨
