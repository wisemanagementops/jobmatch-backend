-- ============================================
-- JobMatch AI - Auto-Apply System Migration
-- Version: 002
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- APPLICATIONS TABLE (Track all applications)
-- ============================================
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES discovered_jobs(id) ON DELETE SET NULL,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  
  -- Job details (snapshot at time of application)
  job_title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  job_url TEXT NOT NULL,
  job_location VARCHAR(255),
  job_description TEXT,
  
  -- Application details
  application_method VARCHAR(50), -- 'easy_apply', 'standard_form', 'email', 'external'
  application_url TEXT,
  application_platform VARCHAR(50), -- 'linkedin', 'indeed', 'greenhouse', 'lever', 'workday', 'custom'
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'queued', -- queued, preparing, ready, submitting, submitted, failed, withdrawn
  substatus VARCHAR(100),
  
  -- Documents used
  resume_version_id UUID,
  cover_letter_id UUID,
  
  -- Submission details
  submitted_at TIMESTAMP,
  submission_method VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manual', 'assisted'
  
  -- Response tracking
  response_received BOOLEAN DEFAULT FALSE,
  response_type VARCHAR(50), -- 'rejection', 'interview_request', 'assessment', 'offer'
  response_date TIMESTAMP,
  
  -- Follow-up
  last_followup_at TIMESTAMP,
  next_followup_at TIMESTAMP,
  followup_count INTEGER DEFAULT 0,
  
  -- Notes
  user_notes TEXT,
  internal_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted ON applications(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_name);

-- ============================================
-- APPLICATION QUEUE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS application_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES discovered_jobs(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  
  -- Job info (denormalized for quick access)
  job_title VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  job_url TEXT NOT NULL,
  job_location VARCHAR(255),
  job_description TEXT,
  
  -- Queue metadata
  priority INTEGER DEFAULT 5, -- 1-10, higher = more urgent
  match_score INTEGER,
  
  -- Generation status
  resume_generated BOOLEAN DEFAULT FALSE,
  resume_version_id UUID,
  cover_letter_generated BOOLEAN DEFAULT FALSE,
  cover_letter_id UUID,
  
  -- User approval
  requires_review BOOLEAN DEFAULT TRUE,
  user_approved BOOLEAN DEFAULT FALSE,
  user_rejected BOOLEAN DEFAULT FALSE,
  rejection_reason VARCHAR(255),
  reviewed_at TIMESTAMP,
  
  -- Processing status
  status VARCHAR(50) DEFAULT 'pending', -- pending, ready, processing, completed, failed, cancelled
  auto_submit_eligible BOOLEAN DEFAULT FALSE,
  scheduled_for TIMESTAMP,
  
  -- Attempt tracking
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_user ON application_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON application_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON application_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_approved ON application_queue(user_approved) WHERE user_approved = TRUE;

-- ============================================
-- RESUME VERSIONS TABLE (Track tailored versions)
-- ============================================
CREATE TABLE IF NOT EXISTS resume_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
  
  -- Version info
  version_name VARCHAR(255),
  is_tailored BOOLEAN DEFAULT FALSE,
  tailored_for_job_id UUID REFERENCES discovered_jobs(id) ON DELETE SET NULL,
  tailored_for_company VARCHAR(255),
  tailored_for_role VARCHAR(255),
  
  -- Content
  resume_text TEXT NOT NULL,
  resume_data JSONB,
  
  -- File URLs (if generated)
  pdf_url TEXT,
  docx_url TEXT,
  txt_url TEXT,
  
  -- Metadata
  optimization_score INTEGER,
  ats_score INTEGER,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resume_versions_user ON resume_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_base ON resume_versions(base_resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_job ON resume_versions(tailored_for_job_id);

-- ============================================
-- COVER LETTERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cover_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Association
  job_id UUID REFERENCES discovered_jobs(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  
  -- Content
  letter_text TEXT NOT NULL,
  company_name VARCHAR(255),
  job_title VARCHAR(255),
  tone VARCHAR(50) DEFAULT 'professional',
  
  -- File URLs (if generated)
  pdf_url TEXT,
  docx_url TEXT,
  txt_url TEXT,
  
  -- Metadata
  word_count INTEGER,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user ON cover_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_cover_letters_job ON cover_letters(job_id);

-- ============================================
-- APPLICATION EVENTS TABLE (Timeline/audit log)
-- ============================================
CREATE TABLE IF NOT EXISTS application_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  description TEXT,
  
  -- Source
  triggered_by VARCHAR(50) DEFAULT 'system', -- 'user', 'system', 'automation'
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_events_application ON application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON application_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_type ON application_events(event_type);

-- ============================================
-- APPLICATION FORM PATTERNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS form_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Form identification
  domain VARCHAR(255) NOT NULL,
  form_type VARCHAR(100),
  url_pattern VARCHAR(500),
  
  -- Field mappings
  field_patterns JSONB,
  
  -- Success tracking
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  
  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_patterns_domain ON form_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_form_patterns_type ON form_patterns(form_type);

-- ============================================
-- USER APPLICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS application_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Auto-apply settings
  auto_apply_enabled BOOLEAN DEFAULT FALSE,
  auto_apply_threshold INTEGER DEFAULT 80,
  daily_application_limit INTEGER DEFAULT 10,
  
  -- Filters
  min_salary INTEGER,
  max_commute_distance INTEGER,
  require_remote BOOLEAN DEFAULT FALSE,
  blacklisted_companies TEXT[],
  blacklisted_keywords TEXT[],
  required_keywords TEXT[],
  excluded_job_types TEXT[],
  
  -- Application timing
  apply_during_business_hours BOOLEAN DEFAULT TRUE,
  preferred_apply_time TIME,
  time_zone VARCHAR(50),
  
  -- Form data (common application questions)
  work_authorization JSONB, -- {authorized: bool, requiresSponsorship: bool, visaType: string}
  availability JSONB, -- {startDate: date, noticePeriod: string}
  salary_expectations JSONB, -- {min: number, max: number, currency: string}
  relocation JSONB, -- {willingToRelocate: bool, preferredLocations: []}
  
  -- Custom questions answers
  custom_answers JSONB,
  
  -- Notifications
  notify_on_submission BOOLEAN DEFAULT TRUE,
  notify_on_response BOOLEAN DEFAULT TRUE,
  notify_on_errors BOOLEAN DEFAULT TRUE,
  notification_email VARCHAR(255),
  
  -- Follow-up settings
  auto_followup_enabled BOOLEAN DEFAULT FALSE,
  followup_after_days INTEGER DEFAULT 7,
  followup_template TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Add triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_applications_updated_at ON applications;
CREATE TRIGGER update_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_queue_updated_at ON application_queue;
CREATE TRIGGER update_app_queue_updated_at
    BEFORE UPDATE ON application_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_prefs_updated_at ON application_preferences;
CREATE TRIGGER update_app_prefs_updated_at
    BEFORE UPDATE ON application_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_form_patterns_updated_at ON form_patterns;
CREATE TRIGGER update_form_patterns_updated_at
    BEFORE UPDATE ON form_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Insert default form patterns for common ATS systems
-- ============================================
INSERT INTO form_patterns (domain, form_type, url_pattern, field_patterns) VALUES
('greenhouse.io', 'greenhouse', '%boards.greenhouse.io%', '{
  "firstName": {"selectors": ["#first_name", "input[name=\"first_name\"]"], "type": "text"},
  "lastName": {"selectors": ["#last_name", "input[name=\"last_name\"]"], "type": "text"},
  "email": {"selectors": ["#email", "input[name=\"email\"]"], "type": "email"},
  "phone": {"selectors": ["#phone", "input[name=\"phone\"]"], "type": "tel"},
  "resume": {"selectors": ["#resume", "input[type=\"file\"][name=\"resume\"]"], "type": "file"},
  "coverLetter": {"selectors": ["#cover_letter", "input[type=\"file\"][name=\"cover_letter\"]"], "type": "file"}
}'),

('lever.co', 'lever', '%jobs.lever.co%', '{
  "name": {"selectors": ["input[name=\"name\"]"], "type": "text"},
  "email": {"selectors": ["input[name=\"email\"]"], "type": "email"},
  "phone": {"selectors": ["input[name=\"phone\"]"], "type": "tel"},
  "resume": {"selectors": ["input[name=\"resume\"]"], "type": "file"}
}'),

('myworkdayjobs.com', 'workday', '%myworkdayjobs.com%', '{
  "firstName": {"selectors": ["input[data-automation-id*=\"firstName\"]"], "type": "text"},
  "lastName": {"selectors": ["input[data-automation-id*=\"lastName\"]"], "type": "text"},
  "email": {"selectors": ["input[data-automation-id*=\"email\"]"], "type": "email"},
  "phone": {"selectors": ["input[data-automation-id*=\"phone\"]"], "type": "tel"}
}'),

('linkedin.com', 'linkedin_easy', '%linkedin.com/jobs/apply%', '{
  "phone": {"selectors": ["#single-line-text-form-component-phoneNumber"], "type": "tel"}
}'),

('indeed.com', 'indeed_easy', '%indeed.com/viewjob%', '{
  "phone": {"selectors": ["#jobsearch-PhoneNumber"], "type": "tel"},
  "resume": {"selectors": ["#resumeUpload"], "type": "file"}
}')
ON CONFLICT DO NOTHING;

-- ============================================
-- Create view for application dashboard
-- ============================================
CREATE OR REPLACE VIEW application_dashboard AS
SELECT 
  a.id,
  a.user_id,
  a.job_title,
  a.company_name,
  a.job_location,
  a.status,
  a.substatus,
  a.submitted_at,
  a.response_received,
  a.response_type,
  a.application_method,
  rv.version_name as resume_version,
  cl.letter_text IS NOT NULL as has_cover_letter,
  an.match_score,
  an.ats_score,
  a.created_at,
  a.updated_at
FROM applications a
LEFT JOIN resume_versions rv ON a.resume_version_id = rv.id
LEFT JOIN cover_letters cl ON a.cover_letter_id = cl.id
LEFT JOIN analyses an ON a.analysis_id = an.id;

-- ============================================
-- Create function to get application stats
-- ============================================
CREATE OR REPLACE FUNCTION get_application_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'submitted', COUNT(*) FILTER (WHERE status = 'submitted'),
    'interviewing', COUNT(*) FILTER (WHERE response_type = 'interview_request'),
    'rejected', COUNT(*) FILTER (WHERE response_type = 'rejection'),
    'pending', COUNT(*) FILTER (WHERE status IN ('queued', 'preparing', 'ready')),
    'response_rate', 
      CASE 
        WHEN COUNT(*) FILTER (WHERE status = 'submitted') > 0 
        THEN ROUND(
          (COUNT(*) FILTER (WHERE response_received = TRUE)::NUMERIC / 
           COUNT(*) FILTER (WHERE status = 'submitted')::NUMERIC) * 100, 
          2
        )
        ELSE 0
      END,
    'average_match_score', 
      COALESCE(ROUND(AVG(an.match_score)), 0)
  )
  INTO result
  FROM applications a
  LEFT JOIN analyses an ON a.analysis_id = an.id
  WHERE a.user_id = p_user_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Create function to log application events
-- ============================================
CREATE OR REPLACE FUNCTION log_application_event(
  p_application_id UUID,
  p_user_id UUID,
  p_event_type VARCHAR,
  p_description TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT NULL,
  p_triggered_by VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO application_events (
    application_id, user_id, event_type, description, event_data, triggered_by
  ) VALUES (
    p_application_id, p_user_id, p_event_type, p_description, p_event_data, p_triggered_by
  )
  RETURNING id INTO event_id;
  
  RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Success message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Auto-apply system tables created successfully!';
  RAISE NOTICE '📊 Created tables: applications, application_queue, resume_versions, cover_letters, application_events, form_patterns, application_preferences';
  RAISE NOTICE '🔧 Created views: application_dashboard';
  RAISE NOTICE '⚙️  Created functions: get_application_stats, log_application_event';
END $$;
