/**
 * JobMatch AI - Backend Server
 * 
 * Main entry point for the API server.
 * Handles authentication, AI analysis, payments, and job alerts.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

// Import routes
const authRoutes = require('./routes/auth');
const analyzeRoutes = require('./routes/analyze');
const resumeRoutes = require('./routes/resumes');
const paymentRoutes = require('./routes/payments');
const jobRoutes = require('./routes/jobs');
const extensionRoutes = require('./routes/extension');
const applicationsRoutes = require('./routes/applications');
const preferencesRoutes = require('./routes/preferences');
const documentsRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// DATABASE SCHEMA - Auto-creates tables if missing
// ============================================
const initializeDatabase = async () => {
  console.log('🔄 Checking database schema...');
  
  const schema = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- USERS TABLE
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      subscription_status VARCHAR(50) DEFAULT 'free',
      subscription_type VARCHAR(50),
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      subscription_ends_at TIMESTAMP,
      analyses_today INTEGER DEFAULT 0,
      analyses_total INTEGER DEFAULT 0,
      last_analysis_date DATE,
      target_job_titles TEXT[],
      target_locations TEXT[],
      remote_preference VARCHAR(50) DEFAULT 'hybrid',
      min_salary INTEGER,
      onboarding_completed BOOLEAN DEFAULT FALSE,
      onboarding_step VARCHAR(50) DEFAULT 'welcome',
      extension_installed BOOLEAN DEFAULT FALSE,
      first_analysis_at TIMESTAMP,
      email_verified BOOLEAN DEFAULT FALSE,
      email_verification_token VARCHAR(255),
      password_reset_token VARCHAR(255),
      password_reset_expires TIMESTAMP,
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

    -- RESUMES TABLE
    CREATE TABLE IF NOT EXISTS resumes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL DEFAULT 'My Resume',
      is_primary BOOLEAN DEFAULT FALSE,
      contact_info JSONB,
      summary TEXT,
      work_experience JSONB,
      education JSONB,
      skills TEXT[],
      certifications JSONB,
      projects JSONB,
      publications JSONB,
      achievements JSONB,
      industry VARCHAR(100),
      target_role VARCHAR(255),
      original_file_url TEXT,
      original_file TEXT,
      original_file_type VARCHAR(50),
      raw_text TEXT,
      extracted_job_titles TEXT[],
      extracted_skills TEXT[],
      years_of_experience INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

    -- ANALYSES TABLE
    CREATE TABLE IF NOT EXISTS analyses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
      job_title VARCHAR(255),
      company_name VARCHAR(255),
      job_url TEXT,
      job_description TEXT,
      job_location VARCHAR(255),
      job_salary_range VARCHAR(100),
      match_score INTEGER,
      ats_score INTEGER,
      analysis_result JSONB,
      tailored_resume_text TEXT,
      tailored_resume_score INTEGER,
      cover_letter TEXT,
      matching_skills TEXT[],
      missing_skills TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);

    -- JOB ALERTS TABLE
    CREATE TABLE IF NOT EXISTS job_alerts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN DEFAULT TRUE,
      alert_name VARCHAR(255) DEFAULT 'My Job Alert',
      job_titles TEXT[] NOT NULL,
      locations TEXT[],
      include_remote BOOLEAN DEFAULT TRUE,
      min_salary INTEGER,
      keywords TEXT[],
      excluded_keywords TEXT[],
      excluded_companies TEXT[],
      min_match_score INTEGER DEFAULT 60,
      frequency VARCHAR(50) DEFAULT 'daily',
      last_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_job_alerts_user ON job_alerts(user_id);

    -- DISCOVERED JOBS TABLE
    CREATE TABLE IF NOT EXISTS discovered_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      external_id VARCHAR(255),
      source VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      company VARCHAR(255),
      location VARCHAR(255),
      description TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency VARCHAR(10) DEFAULT 'USD',
      job_type VARCHAR(50),
      is_remote BOOLEAN DEFAULT FALSE,
      apply_url TEXT,
      required_skills TEXT[],
      posted_at TIMESTAMP,
      expires_at TIMESTAMP,
      discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(external_id, source)
    );

    CREATE INDEX IF NOT EXISTS idx_discovered_jobs_source ON discovered_jobs(source);

    -- USER JOB MATCHES TABLE
    CREATE TABLE IF NOT EXISTS user_job_matches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES discovered_jobs(id) ON DELETE CASCADE,
      alert_id UUID REFERENCES job_alerts(id) ON DELETE SET NULL,
      match_score INTEGER,
      matched_skills TEXT[],
      is_viewed BOOLEAN DEFAULT FALSE,
      is_saved BOOLEAN DEFAULT FALSE,
      is_applied BOOLEAN DEFAULT FALSE,
      is_dismissed BOOLEAN DEFAULT FALSE,
      notified_at TIMESTAMP,
      matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, job_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_job_matches_user ON user_job_matches(user_id);

    -- PAYMENTS TABLE
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_payment_intent_id VARCHAR(255),
      stripe_invoice_id VARCHAR(255),
      amount INTEGER NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      status VARCHAR(50) NOT NULL,
      payment_type VARCHAR(50),
      plan_type VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

    -- RESUME BUILDER SESSIONS TABLE
    CREATE TABLE IF NOT EXISTS resume_builder_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      current_step VARCHAR(100),
      conversation_history JSONB,
      collected_data JSONB,
      progress_percent INTEGER DEFAULT 0,
      is_complete BOOLEAN DEFAULT FALSE,
      generated_resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_builder_sessions_user ON resume_builder_sessions(user_id);

    -- APPLICATIONS TABLE (for tracking job applications)
    CREATE TABLE IF NOT EXISTS applications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_title VARCHAR(255),
      company_name VARCHAR(255),
      job_url TEXT,
      job_description TEXT,
      status VARCHAR(50) DEFAULT 'saved',
      applied_at TIMESTAMP,
      resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
      cover_letter TEXT,
      notes TEXT,
      salary_offered VARCHAR(100),
      interview_dates JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

    -- APPLICATION QUEUE TABLE
    CREATE TABLE IF NOT EXISTS application_queue (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_title VARCHAR(255),
      company_name VARCHAR(255),
      job_url TEXT,
      job_description TEXT,
      match_score INTEGER,
      status VARCHAR(50) DEFAULT 'pending',
      tailored_resume TEXT,
      cover_letter TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_application_queue_user ON application_queue(user_id);
  `;

  try {
    await pool.query(schema);
    console.log('✅ Database schema ready!\n');
  } catch (error) {
    console.error('❌ Database schema error:', error.message);
    throw error;
  }
};

// ============================================
// CORS CONFIGURATION
// ============================================
const ALLOWED_ORIGINS = [
  'https://jobmatch-frontend-one.vercel.app',
  'https://jobmatch-webapp.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

if (process.env.FRONTEND_URL) {
  const url = process.env.FRONTEND_URL.replace(/\/$/, '');
  if (!ALLOWED_ORIGINS.includes(url)) {
    ALLOWED_ORIGINS.push(url);
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    if (origin.includes('vercel.app') && origin.includes('jobmatch')) {
      return callback(null, true);
    }
    console.log(`[CORS] Rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// Body parsing
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ============================================
// API ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/applications', preferencesRoutes);
app.use('/api/documents', documentsRoutes);

// ============================================
// API DOCUMENTATION
// ============================================
app.get('/api', (req, res) => {
  res.json({
    name: 'JobMatch AI API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Create new account',
        'POST /api/auth/login': 'Login',
        'GET /api/auth/me': 'Get current user'
      }
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS: Origin not allowed'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ============================================
// SCHEDULED TASKS
// ============================================
const resetDailyUsage = async () => {
  try {
    await pool.query(`
      UPDATE users SET analyses_today = 0 
      WHERE last_analysis_date < CURRENT_DATE
    `);
    console.log('✅ Daily usage counts reset');
  } catch (error) {
    // Table might not exist yet, ignore
    if (!error.message.includes('does not exist')) {
      console.error('❌ Failed to reset daily usage:', error.message);
    }
  }
};

// ============================================
// START SERVER
// ============================================
const startServer = async () => {
  try {
    // Initialize database schema first
    await initializeDatabase();
    
    // Then start scheduled tasks
    resetDailyUsage();
    setInterval(resetDailyUsage, 60 * 60 * 1000);
    
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       🎯 JobMatch AI API Server                           ║
║                                                           ║
║       Running on port: ${PORT}                              ║
║       Environment: ${process.env.NODE_ENV || 'development'}                       ║
║                                                           ║
║       Endpoints: /api                                     ║
║       Health: /health                                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down...');
  await pool.end();
  process.exit(0);
});

module.exports = app;
