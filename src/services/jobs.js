/**
 * Job Fetcher Service
 * Fetches jobs from external APIs (Adzuna, etc.)
 * and matches them against user profiles
 */

const { query, transaction } = require('../db');
const { calculateJobMatch } = require('./ai');
const { sendJobAlertEmail } = require('./email');

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs';

/**
 * Fetch jobs from Adzuna API
 */
async function fetchFromAdzuna(searchParams) {
  const {
    jobTitles = [],
    locations = [],
    country = 'us',
    page = 1,
    resultsPerPage = 50
  } = searchParams;

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    console.warn('⚠️ Adzuna API credentials not configured');
    return [];
  }

  const jobs = [];

  for (const title of jobTitles) {
    try {
      const searchQuery = encodeURIComponent(title);
      const location = locations[0] ? encodeURIComponent(locations[0]) : '';
      
      const url = `${ADZUNA_BASE_URL}/${country}/search/${page}?` + 
        `app_id=${process.env.ADZUNA_APP_ID}` +
        `&app_key=${process.env.ADZUNA_APP_KEY}` +
        `&results_per_page=${resultsPerPage}` +
        `&what=${searchQuery}` +
        (location ? `&where=${location}` : '') +
        `&sort_by=date`;

      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Adzuna API error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (data.results) {
        jobs.push(...data.results.map(job => ({
          external_id: job.id,
          source: 'adzuna',
          title: job.title,
          company: job.company?.display_name || 'Unknown',
          location: job.location?.display_name || 'Unknown',
          description: job.description,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          job_type: job.contract_type || null,
          is_remote: job.title?.toLowerCase().includes('remote') || 
                     job.description?.toLowerCase().includes('remote'),
          apply_url: job.redirect_url,
          posted_at: job.created ? new Date(job.created) : new Date()
        })));
      }
    } catch (error) {
      console.error(`Error fetching from Adzuna for "${title}":`, error);
    }
  }

  return jobs;
}

/**
 * Save discovered jobs to database
 */
async function saveDiscoveredJobs(jobs) {
  const savedJobs = [];

  for (const job of jobs) {
    try {
      const result = await query(
        `INSERT INTO discovered_jobs 
          (external_id, source, title, company, location, description, 
           salary_min, salary_max, job_type, is_remote, apply_url, posted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (external_id, source) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           salary_min = EXCLUDED.salary_min,
           salary_max = EXCLUDED.salary_max
         RETURNING id`,
        [
          job.external_id,
          job.source,
          job.title,
          job.company,
          job.location,
          job.description?.substring(0, 10000), // Truncate long descriptions
          job.salary_min,
          job.salary_max,
          job.job_type,
          job.is_remote,
          job.apply_url,
          job.posted_at
        ]
      );

      savedJobs.push({ ...job, id: result.rows[0].id });
    } catch (error) {
      // Ignore duplicate errors
      if (!error.message.includes('duplicate')) {
        console.error('Error saving job:', error.message);
      }
    }
  }

  return savedJobs;
}

/**
 * Match jobs against a user's profile
 */
async function matchJobsForUser(userId, jobs) {
  // Get user's resume data
  const resumeResult = await query(
    `SELECT extracted_skills, extracted_job_titles, years_of_experience
     FROM resumes 
     WHERE user_id = $1 AND is_primary = TRUE
     LIMIT 1`,
    [userId]
  );

  if (resumeResult.rows.length === 0) {
    console.log(`No primary resume found for user ${userId}`);
    return [];
  }

  const resumeData = resumeResult.rows[0];
  const matches = [];

  for (const job of jobs) {
    try {
      // Calculate match using AI
      const matchResult = await calculateJobMatch(
        {
          title: job.title,
          company: job.company,
          required_skills: job.required_skills || []
        },
        {
          skills: resumeData.extracted_skills,
          target_job_titles: resumeData.extracted_job_titles,
          years_of_experience: resumeData.years_of_experience
        }
      );

      if (matchResult.matchScore >= 50) { // Only save if decent match
        matches.push({
          job_id: job.id,
          match_score: matchResult.matchScore,
          matched_skills: matchResult.matchedSkills
        });
      }
    } catch (error) {
      console.error('Match calculation error:', error);
    }
  }

  return matches;
}

/**
 * Save user job matches to database
 */
async function saveUserMatches(userId, matches, alertId = null) {
  const savedMatches = [];

  for (const match of matches) {
    try {
      const result = await query(
        `INSERT INTO user_job_matches 
          (user_id, job_id, alert_id, match_score, matched_skills)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, job_id) DO UPDATE SET
           match_score = GREATEST(user_job_matches.match_score, EXCLUDED.match_score)
         RETURNING id`,
        [userId, match.job_id, alertId, match.match_score, match.matched_skills || []]
      );

      savedMatches.push({ ...match, id: result.rows[0].id });
    } catch (error) {
      console.error('Error saving match:', error);
    }
  }

  return savedMatches;
}

/**
 * Process job alerts for all users
 * Call this from a cron job
 */
async function processJobAlerts() {
  console.log('🔄 Processing job alerts...');

  try {
    // Get all active alerts
    const alertsResult = await query(
      `SELECT ja.*, u.email, u.full_name, u.subscription_status
       FROM job_alerts ja
       JOIN users u ON ja.user_id = u.id
       WHERE ja.is_active = TRUE
       AND u.subscription_status IN ('pro', 'lifetime')
       AND (
         ja.frequency = 'instant'
         OR (ja.frequency = 'daily' AND (ja.last_sent_at IS NULL OR ja.last_sent_at < CURRENT_DATE))
         OR (ja.frequency = 'weekly' AND (ja.last_sent_at IS NULL OR ja.last_sent_at < CURRENT_DATE - INTERVAL '7 days'))
       )`
    );

    console.log(`Found ${alertsResult.rows.length} alerts to process`);

    for (const alert of alertsResult.rows) {
      try {
        // Fetch jobs matching alert criteria
        const jobs = await fetchFromAdzuna({
          jobTitles: alert.job_titles,
          locations: alert.locations,
          country: 'us'
        });

        console.log(`Fetched ${jobs.length} jobs for alert ${alert.id}`);

        // Save discovered jobs
        const savedJobs = await saveDiscoveredJobs(jobs);

        // Match against user's profile
        const matches = await matchJobsForUser(alert.user_id, savedJobs);

        // Filter by min match score
        const qualifiedMatches = matches.filter(m => m.match_score >= alert.min_match_score);

        if (qualifiedMatches.length > 0) {
          // Save matches
          await saveUserMatches(alert.user_id, qualifiedMatches, alert.id);

          // Get full job details for email
          const jobIds = qualifiedMatches.map(m => m.job_id);
          const jobsResult = await query(
            `SELECT * FROM discovered_jobs WHERE id = ANY($1)`,
            [jobIds]
          );

          const jobsWithScores = jobsResult.rows.map(job => ({
            ...job,
            match_score: qualifiedMatches.find(m => m.job_id === job.id)?.match_score || 0
          }));

          // Send email notification
          await sendJobAlertEmail(alert.email, alert.full_name, jobsWithScores);

          console.log(`✅ Sent ${qualifiedMatches.length} job matches to ${alert.email}`);
        }

        // Update last sent timestamp
        await query(
          'UPDATE job_alerts SET last_sent_at = CURRENT_TIMESTAMP WHERE id = $1',
          [alert.id]
        );

      } catch (error) {
        console.error(`Error processing alert ${alert.id}:`, error);
      }
    }

    console.log('✅ Job alerts processing complete');

  } catch (error) {
    console.error('❌ Job alerts processing failed:', error);
  }
}

/**
 * Clean up old discovered jobs (older than 30 days)
 */
async function cleanupOldJobs() {
  try {
    const result = await query(
      `DELETE FROM discovered_jobs 
       WHERE posted_at < CURRENT_DATE - INTERVAL '30 days'
       RETURNING id`
    );

    console.log(`🧹 Cleaned up ${result.rows.length} old jobs`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

module.exports = {
  fetchFromAdzuna,
  saveDiscoveredJobs,
  matchJobsForUser,
  saveUserMatches,
  processJobAlerts,
  cleanupOldJobs
};
