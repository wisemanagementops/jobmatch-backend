/**
 * migrate-onboarding.js
 * Database migration to add onboarding tracking fields
 * 
 * ADD THIS FILE TO: backend/src/db/migrate-onboarding.js
 * 
 * RUN WITH: node backend/src/db/migrate-onboarding.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const migration = `
-- ============================================
-- ONBOARDING TRACKING MIGRATION
-- ============================================

-- Add onboarding fields to users table
DO $$ 
BEGIN
  -- Add onboarding_completed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added onboarding_completed column';
  END IF;

  -- Add onboarding_step column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'onboarding_step'
  ) THEN
    ALTER TABLE users ADD COLUMN onboarding_step VARCHAR(50) DEFAULT 'welcome';
    RAISE NOTICE 'Added onboarding_step column';
  END IF;

  -- Add extension_installed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'extension_installed'
  ) THEN
    ALTER TABLE users ADD COLUMN extension_installed BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added extension_installed column';
  END IF;

  -- Add first_analysis_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'first_analysis_at'
  ) THEN
    ALTER TABLE users ADD COLUMN first_analysis_at TIMESTAMP;
    RAISE NOTICE 'Added first_analysis_at column';
  END IF;
END $$;

-- Mark existing users with resumes/analyses as having completed onboarding
UPDATE users u
SET onboarding_completed = TRUE,
    onboarding_step = 'complete'
WHERE EXISTS (
  SELECT 1 FROM resumes r WHERE r.user_id = u.id
)
AND EXISTS (
  SELECT 1 FROM analyses a WHERE a.user_id = u.id
)
AND onboarding_completed = FALSE;

-- Set first_analysis_at for existing users who have analyses
UPDATE users u
SET first_analysis_at = (
  SELECT MIN(created_at) FROM analyses a WHERE a.user_id = u.id
)
WHERE first_analysis_at IS NULL
AND EXISTS (SELECT 1 FROM analyses a WHERE a.user_id = u.id);

-- Show migration result
SELECT 'Migration complete!' as status;
`;

async function runMigration() {
  console.log('🚀 Running onboarding migration...\n');
  
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');
    
    await client.query(migration);
    
    // Verify columns exist
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('onboarding_completed', 'onboarding_step', 'extension_installed', 'first_analysis_at')
      ORDER BY column_name
    `);
    
    console.log('📋 New columns added to users table:');
    result.rows.forEach(row => {
      console.log(`   • ${row.column_name} (${row.data_type}) - default: ${row.column_default || 'null'}`);
    });
    
    client.release();
    console.log('\n✨ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
