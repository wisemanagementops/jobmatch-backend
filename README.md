# JobMatch AI - Backend

AI-powered job application assistance platform backend built with Node.js, Express, and PostgreSQL.

## Features

- 🔐 **User Authentication** - JWT-based auth with secure password hashing
- 🤖 **AI Resume Builder** - Guided resume creation with Anthropic Claude
- 📄 **Resume Management** - Upload, parse, and download resumes (PDF/DOCX)
- 🎯 **Job Matching** - AI-powered job-resume compatibility analysis
- 💳 **Payment Integration** - Stripe subscriptions and one-time payments
- 📊 **Application Tracking** - Track job applications and their status
- 🔔 **Job Alerts** - Automated job discovery and matching

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 5
- **Database**: PostgreSQL 14+
- **AI**: Anthropic Claude API
- **Payments**: Stripe
- **Auth**: JWT + bcrypt

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher (or Railway PostgreSQL)
- Anthropic API key
- Stripe account (for payments)

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Required Variables:

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | Railway auto-provides this |
| `JWT_SECRET` | Secret key for JWT tokens | Generate a random 32+ char string |
| `ANTHROPIC_API_KEY` | Anthropic API key | https://console.anthropic.com/ |
| `FRONTEND_URL` | Your frontend URL | Your Vercel deployment URL |

### Optional Variables:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | For payment processing |
| `STRIPE_WEBHOOK_SECRET` | For Stripe webhooks |
| `STRIPE_PRICE_*` | Product price IDs |
| `SMTP_*` | Email configuration |
| `ADZUNA_*` | Job discovery API |

## Deployment to Railway

### Step 1: Create Railway Project

1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `jobmatch-backend` repository

### Step 2: Add PostgreSQL

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically set `DATABASE_URL`

### Step 3: Set Environment Variables

Go to your backend service → Variables tab and add these (use YOUR actual values):

```
ANTHROPIC_API_KEY=<your-anthropic-api-key>
JWT_SECRET=<your-secure-random-string>
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
PORT=3000
```

**Optional (if using Stripe):**
```
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
STRIPE_PRICE_PRO_MONTHLY=<your-price-id>
STRIPE_PRICE_PRO_ANNUAL=<your-price-id>
STRIPE_PRICE_LIFETIME=<your-price-id>
```

### Step 4: Deploy

Railway will automatically deploy when you push to GitHub.

### Step 5: Verify Deployment

```bash
curl https://your-railway-url.railway.app/health
```

## API Documentation

Full API documentation available at the `/api` endpoint when running.

## Security Notes

- **Never commit `.env` file** to GitHub
- **Never commit API keys** or secrets
- All secrets should be in Railway environment variables
- JWT tokens expire after 7 days (configurable)
- Passwords are hashed with bcrypt (10 rounds)

## License

MIT
