/**
 * Database Migration Script
 * Adds missing columns to existing tables without data loss
 */

const { query } = require('./index');

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  
  try {
    const migrations = [
      {
        name: 'Add achievements column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS achievements JSONB`
      },
      {
        name: 'Add industry column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS industry VARCHAR(100)`
      },
      {
        name: 'Add target_role column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS target_role VARCHAR(255)`
      },
      {
        name: 'Add projects column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS projects JSONB`
      },
      {
        name: 'Add publications column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS publications JSONB`
      },
      {
        name: 'Add certifications column',
        sql: `ALTER TABLE resumes ADD COLUMN IF NOT EXISTS certifications JSONB`
      }
    ];

    for (const migration of migrations) {
      try {
        await query(migration.sql);
        console.log(`  ✅ ${migration.name}`);
      } catch (err) {
        // Column might already exist, which is fine
        if (!err.message.includes('already exists')) {
          console.log(`  ⚠️ ${migration.name}: ${err.message}`);
        }
      }
    }

    console.log('✅ Migrations complete!\n');
    return true;
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    return false;
  }
}

module.exports = { runMigrations };
