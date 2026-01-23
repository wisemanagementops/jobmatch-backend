/**
 * Reset daily usage count for all users
 * Run: node reset-usage.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function resetUsage() {
  try {
    const result = await pool.query(
      `UPDATE users SET analyses_today = 0, last_analysis_date = NULL RETURNING email`
    );
    
    console.log(`Reset daily usage for ${result.rowCount} users:`);
    result.rows.forEach(row => console.log(`  - ${row.email}`));
    console.log('\nDone! Users can now analyze jobs again.');
    
  } catch (error) {
    console.error('Error resetting usage:', error);
  } finally {
    await pool.end();
  }
}

resetUsage();
