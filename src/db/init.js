/**
 * JobMatch AI - Database Schema
 * Run: npm run db:init
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const schema = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  
  -- Subscription info
  subscription_status VARCHAR(50) DEFAULT 'free', -- free, pro, lifetime, cancelled
  subscription_type VARCHAR(50), -- monthly, annual, lifetime
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_ends_at TIMESTAMP,
  
  -- Usage tracking
  analyses_today INTEGER DEFAULT 0,
  analyses_total INTEGER DEFAULT 0,
  last_analysis_date DATE,
  
  -- Profile for job matching
  target_job_titles TEXT[], -- Array of job titles
  target_locations TEXT[], -- Array of locations
  remote_preference VARCHAR(50) DEFAULT 'hybrid', -- remote, onsite, hybrid
  min_salary INTEGER,
  
  -- Onboarding tracking
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step VARCHAR(50) DEFAULT 'welcome',
  extension_installed BOOLEAN DEFAULT FALSE,
  first_analysis_at TIMESTAMP,
  
  -- Metadata
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- ============================================
-- RESUMES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Resume metadata
  name VARCHAR(255) NOT NULL DEFAULT 'My Resume',
  is_primary BOOLEAN DEFAULT FALSE,
  
  -- Resume content (structured)
  contact_info JSONB, -- {name, email, phone, location, linkedin, portfolio}
  summary TEXT,
  work_experience JSONB, -- [{company, title, start, end, bullets: [], location}]
  education JSONB, -- [{school, degree, field, graduation, gpa}]
  skills TEXT[], -- Array of skills
  certifications JSONB, -- [{name, issuer, date}]
  projects JSONB, -- [{name, description, technologies, link}]
  
  -- Original file (if uploaded)
  original_file_url TEXT,
  original_file_type VARCHAR(50), -- pdf, docx, txt
  
  -- Raw text for AI analysis
  raw_text TEXT,
  
  -- AI-extracted data
  extracted_job_titles TEXT[],
  extracted_skills TEXT[],
  years_of_experience INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

-- ============================================
-- ANALYSES TABLE (Job-Resume Analysis History)
-- ============================================
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  
  -- Job info
  job_title VARCHAR(255),
  company_name VARCHAR(255),
  job_url TEXT,
  job_description TEXT,
  job_location VARCHAR(255),
  job_salary_range VARCHAR(100),
  
  -- Analysis results
  match_score INTEGER, -- 0-100
  ats_score INTEGER, -- 0-100
  analysis_result JSONB, -- Full AI analysis result
  
  -- Generated content
  tailored_resume_text TEXT,
  tailored_resume_score INTEGER,
  cover_letter TEXT,
  
  -- Skills analysis
  matching_skills TEXT[],
  missing_skills TEXT[],
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);

-- ============================================
-- JOB ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS job_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Alert configuration
  is_active BOOLEAN DEFAULT TRUE,
  alert_name VARCHAR(255) DEFAULT 'My Job Alert',
  
  -- Search criteria
  job_titles TEXT[] NOT NULL, -- Required
  locations TEXT[],
  include_remote BOOLEAN DEFAULT TRUE,
  min_salary INTEGER,
  keywords TEXT[],
  excluded_keywords TEXT[],
  excluded_companies TEXT[],
  
  -- Matching preferences
  min_match_score INTEGER DEFAULT 60, -- Minimum score to alert
  
  -- Notification settings
  frequency VARCHAR(50) DEFAULT 'daily', -- instant, daily, weekly
  last_sent_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user ON job_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_active ON job_alerts(is_active) WHERE is_active = TRUE;

-- ============================================
-- DISCOVERED JOBS TABLE (Cache of jobs from APIs)
-- ============================================
CREATE TABLE IF NOT EXISTS discovered_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- External identifiers
  external_id VARCHAR(255), -- ID from job API
  source VARCHAR(100) NOT NULL, -- adzuna, indeed, linkedin, etc.
  
  -- Job details
  title VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  location VARCHAR(255),
  description TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency VARCHAR(10) DEFAULT 'USD',
  job_type VARCHAR(50), -- full-time, part-time, contract
  is_remote BOOLEAN DEFAULT FALSE,
  apply_url TEXT,
  
  -- For matching
  required_skills TEXT[],
  
  -- Metadata
  posted_at TIMESTAMP,
  expires_at TIMESTAMP,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Prevent duplicates
  UNIQUE(external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_source ON discovered_jobs(source);
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_posted ON discovered_jobs(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_location ON discovered_jobs(location);

-- ============================================
-- USER JOB MATCHES TABLE (Matched jobs for users)
-- ============================================
CREATE TABLE IF NOT EXISTS user_job_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES discovered_jobs(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES job_alerts(id) ON DELETE SET NULL,
  
  -- Match info
  match_score INTEGER, -- 0-100
  matched_skills TEXT[],
  
  -- User actions
  is_viewed BOOLEAN DEFAULT FALSE,
  is_saved BOOLEAN DEFAULT FALSE,
  is_applied BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  
  -- Notification
  notified_at TIMESTAMP,
  
  -- Metadata
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_matches_user ON user_job_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_job_matches_score ON user_job_matches(match_score DESC);

-- ============================================
-- PAYMENTS TABLE (Payment history)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Stripe info
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  
  -- Payment details
  amount INTEGER NOT NULL, -- in cents
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL, -- succeeded, failed, pending, refunded
  payment_type VARCHAR(50), -- subscription, one_time
  plan_type VARCHAR(50), -- monthly, annual, lifetime
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- ============================================
-- RESUME BUILDER SESSIONS TABLE (For conversational builder)
-- ============================================
CREATE TABLE IF NOT EXISTS resume_builder_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Session state
  current_step VARCHAR(100), -- contact, experience, education, skills, etc.
  conversation_history JSONB, -- [{role, content}]
  collected_data JSONB, -- Data collected so far
  
  -- Progress
  progress_percent INTEGER DEFAULT 0,
  is_complete BOOLEAN DEFAULT FALSE,
  
  -- Result
  generated_resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  
  -- Metadata
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_builder_sessions_user ON resume_builder_sessions(user_id);

-- ============================================
-- ADD MISSING COLUMNS (for existing databases)
-- ============================================
DO $$ 
BEGIN
  -- Add onboarding_completed if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add onboarding_step if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'onboarding_step') THEN
    ALTER TABLE users ADD COLUMN onboarding_step VARCHAR(50) DEFAULT 'welcome';
  END IF;
  
  -- Add extension_installed if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'extension_installed') THEN
    ALTER TABLE users ADD COLUMN extension_installed BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Add first_analysis_at if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'first_analysis_at') THEN
    ALTER TABLE users ADD COLUMN first_analysis_at TIMESTAMP;
  END IF;
END $$;

-- ============================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_job_alerts_updated_at ON job_alerts;
CREATE TRIGGER update_job_alerts_updated_at
    BEFORE UPDATE ON job_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

async function initDatabase() {
  console.log('🚀 Initializing JobMatch AI Database...\n');
  
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');
    
    // Run schema
    console.log('📦 Creating tables...');
    await client.query(schema);
    
    console.log('✅ Database schema created successfully!\n');
    
    // Show created tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📋 Tables created:');
    tables.rows.forEach(row => {
      console.log(`   • ${row.table_name}`);
    });
    
    client.release();
    console.log('\n✨ Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { pool, initDatabase };
