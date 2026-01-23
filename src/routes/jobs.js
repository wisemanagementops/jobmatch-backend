/**
 * Job Alerts Routes
 * GET /api/jobs/alerts - Get user's job alerts
 * POST /api/jobs/alerts - Create new job alert
 * PUT /api/jobs/alerts/:id - Update job alert
 * DELETE /api/jobs/alerts/:id - Delete job alert
 * GET /api/jobs/matches - Get matched jobs for user
 * POST /api/jobs/matches/:id/action - Mark job as viewed/saved/applied/dismissed
 */

const express = require('express');
const { query } = require('../db');
const { authenticate, requirePro } = require('../middleware/auth');

const router = express.Router();

// ============================================
// JOB ALERTS CRUD
// ============================================

/**
 * Get all job alerts for user
 * GET /api/jobs/alerts
 */
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, alert_name, is_active, job_titles, locations, include_remote,
              min_salary, keywords, excluded_companies, min_match_score, frequency,
              last_sent_at, created_at
       FROM job_alerts 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job alerts.'
    });
  }
});

/**
 * Create new job alert
 * POST /api/jobs/alerts
 */
router.post('/alerts', authenticate, requirePro, async (req, res) => {
  try {
    const {
      alertName,
      jobTitles,
      locations,
      includeRemote = true,
      minSalary,
      keywords,
      excludedKeywords,
      excludedCompanies,
      minMatchScore = 60,
      frequency = 'daily'
    } = req.body;
    
    // Validation
    if (!jobTitles || jobTitles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one job title is required.'
      });
    }
    
    // Check alert limit (max 5 for pro users)
    const countResult = await query(
      'SELECT COUNT(*) as count FROM job_alerts WHERE user_id = $1',
      [req.user.id]
    );
    
    if (parseInt(countResult.rows[0].count) >= 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum of 5 job alerts allowed.'
      });
    }
    
    // Create alert
    const result = await query(
      `INSERT INTO job_alerts 
        (user_id, alert_name, job_titles, locations, include_remote, min_salary,
         keywords, excluded_keywords, excluded_companies, min_match_score, frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, alert_name, created_at`,
      [
        req.user.id,
        alertName || 'My Job Alert',
        jobTitles,
        locations || [],
        includeRemote,
        minSalary,
        keywords || [],
        excludedKeywords || [],
        excludedCompanies || [],
        minMatchScore,
        frequency
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'Job alert created!',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job alert.'
    });
  }
});

/**
 * Update job alert
 * PUT /api/jobs/alerts/:id
 */
router.put('/alerts/:id', authenticate, async (req, res) => {
  try {
    const {
      alertName,
      isActive,
      jobTitles,
      locations,
      includeRemote,
      minSalary,
      keywords,
      excludedKeywords,
      excludedCompanies,
      minMatchScore,
      frequency
    } = req.body;
    
    // Check ownership
    const existing = await query(
      'SELECT id FROM job_alerts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job alert not found.'
      });
    }
    
    // Update alert
    await query(
      `UPDATE job_alerts SET
        alert_name = COALESCE($1, alert_name),
        is_active = COALESCE($2, is_active),
        job_titles = COALESCE($3, job_titles),
        locations = COALESCE($4, locations),
        include_remote = COALESCE($5, include_remote),
        min_salary = COALESCE($6, min_salary),
        keywords = COALESCE($7, keywords),
        excluded_keywords = COALESCE($8, excluded_keywords),
        excluded_companies = COALESCE($9, excluded_companies),
        min_match_score = COALESCE($10, min_match_score),
        frequency = COALESCE($11, frequency)
       WHERE id = $12`,
      [
        alertName,
        isActive,
        jobTitles,
        locations,
        includeRemote,
        minSalary,
        keywords,
        excludedKeywords,
        excludedCompanies,
        minMatchScore,
        frequency,
        req.params.id
      ]
    );
    
    res.json({
      success: true,
      message: 'Job alert updated.'
    });
    
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job alert.'
    });
  }
});

/**
 * Delete job alert
 * DELETE /api/jobs/alerts/:id
 */
router.delete('/alerts/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM job_alerts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job alert not found.'
      });
    }
    
    res.json({
      success: true,
      message: 'Job alert deleted.'
    });
    
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job alert.'
    });
  }
});

// ============================================
// MATCHED JOBS
// ============================================

/**
 * Get matched jobs for user
 * GET /api/jobs/matches
 */
router.get('/matches', authenticate, async (req, res) => {
  try {
    const { status = 'all', limit = 20, offset = 0 } = req.query;
    
    let whereClause = 'WHERE ujm.user_id = $1';
    
    switch (status) {
      case 'new':
        whereClause += ' AND ujm.is_viewed = FALSE AND ujm.is_dismissed = FALSE';
        break;
      case 'saved':
        whereClause += ' AND ujm.is_saved = TRUE';
        break;
      case 'applied':
        whereClause += ' AND ujm.is_applied = TRUE';
        break;
      case 'dismissed':
        whereClause += ' AND ujm.is_dismissed = TRUE';
        break;
    }
    
    const result = await query(
      `SELECT 
        ujm.id, ujm.match_score, ujm.matched_skills, ujm.is_viewed, 
        ujm.is_saved, ujm.is_applied, ujm.is_dismissed, ujm.matched_at,
        dj.id as job_id, dj.title, dj.company, dj.location, dj.description,
        dj.salary_min, dj.salary_max, dj.job_type, dj.is_remote, dj.apply_url, dj.posted_at
       FROM user_job_matches ujm
       JOIN discovered_jobs dj ON ujm.job_id = dj.id
       ${whereClause}
       ORDER BY ujm.match_score DESC, ujm.matched_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );
    
    // Get counts
    const countsResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE NOT is_viewed AND NOT is_dismissed) as new_count,
        COUNT(*) FILTER (WHERE is_saved) as saved_count,
        COUNT(*) FILTER (WHERE is_applied) as applied_count,
        COUNT(*) as total_count
       FROM user_job_matches WHERE user_id = $1`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        jobs: result.rows,
        counts: {
          new: parseInt(countsResult.rows[0].new_count),
          saved: parseInt(countsResult.rows[0].saved_count),
          applied: parseInt(countsResult.rows[0].applied_count),
          total: parseInt(countsResult.rows[0].total_count)
        }
      }
    });
    
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matched jobs.'
    });
  }
});

/**
 * Perform action on matched job
 * POST /api/jobs/matches/:id/action
 */
router.post('/matches/:id/action', authenticate, async (req, res) => {
  try {
    const { action } = req.body; // view, save, unsave, apply, dismiss
    
    // Check ownership
    const existing = await query(
      'SELECT id FROM user_job_matches WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job match not found.'
      });
    }
    
    let updateField;
    switch (action) {
      case 'view':
        updateField = 'is_viewed = TRUE';
        break;
      case 'save':
        updateField = 'is_saved = TRUE';
        break;
      case 'unsave':
        updateField = 'is_saved = FALSE';
        break;
      case 'apply':
        updateField = 'is_applied = TRUE, is_viewed = TRUE';
        break;
      case 'dismiss':
        updateField = 'is_dismissed = TRUE';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action.'
        });
    }
    
    await query(
      `UPDATE user_job_matches SET ${updateField} WHERE id = $1`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      message: `Job ${action} successful.`
    });
    
  } catch (error) {
    console.error('Job action error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform action.'
    });
  }
});

/**
 * Get single matched job detail
 * GET /api/jobs/matches/:id
 */
router.get('/matches/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        ujm.*, 
        dj.title, dj.company, dj.location, dj.description,
        dj.salary_min, dj.salary_max, dj.job_type, dj.is_remote, 
        dj.apply_url, dj.posted_at, dj.required_skills
       FROM user_job_matches ujm
       JOIN discovered_jobs dj ON ujm.job_id = dj.id
       WHERE ujm.id = $1 AND ujm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job match not found.'
      });
    }
    
    // Mark as viewed
    await query(
      'UPDATE user_job_matches SET is_viewed = TRUE WHERE id = $1',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get job detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job details.'
    });
  }
});

module.exports = router;
