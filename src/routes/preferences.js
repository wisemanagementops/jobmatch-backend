/**
 * JobMatch AI - Application Preferences Routes
 * Handles user preferences for auto-apply
 */

const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Get application preferences
 * GET /api/applications/preferences
 */
router.get('/preferences', authenticate, async (req, res) => {
  try {
    let result = await query(
      `SELECT * FROM application_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    // Create default preferences if they don't exist
    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO application_preferences (user_id)
         VALUES ($1)
         RETURNING *`,
        [req.user.id]
      );
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preferences.'
    });
  }
});

/**
 * Update application preferences
 * PUT /api/applications/preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const {
      autoApplyEnabled,
      autoApplyThreshold,
      dailyApplicationLimit,
      minSalary,
      maxCommuteDistance,
      requireRemote,
      blacklistedCompanies,
      blacklistedKeywords,
      requiredKeywords,
      excludedJobTypes,
      applyDuringBusinessHours,
      preferredApplyTime,
      timeZone,
      workAuthorization,
      availability,
      salaryExpectations,
      relocation,
      customAnswers,
      notifyOnSubmission,
      notifyOnResponse,
      notifyOnErrors,
      notificationEmail,
      autoFollowupEnabled,
      followupAfterDays,
      followupTemplate
    } = req.body;

    // Build update fields dynamically
    const updates = [];
    const params = [req.user.id];
    let paramCount = 1;

    const fields = {
      auto_apply_enabled: autoApplyEnabled,
      auto_apply_threshold: autoApplyThreshold,
      daily_application_limit: dailyApplicationLimit,
      min_salary: minSalary,
      max_commute_distance: maxCommuteDistance,
      require_remote: requireRemote,
      blacklisted_companies: blacklistedCompanies,
      blacklisted_keywords: blacklistedKeywords,
      required_keywords: requiredKeywords,
      excluded_job_types: excludedJobTypes,
      apply_during_business_hours: applyDuringBusinessHours,
      preferred_apply_time: preferredApplyTime,
      time_zone: timeZone,
      work_authorization: workAuthorization,
      availability: availability,
      salary_expectations: salaryExpectations,
      relocation: relocation,
      custom_answers: customAnswers,
      notify_on_submission: notifyOnSubmission,
      notify_on_response: notifyOnResponse,
      notify_on_errors: notifyOnErrors,
      notification_email: notificationEmail,
      auto_followup_enabled: autoFollowupEnabled,
      followup_after_days: followupAfterDays,
      followup_template: followupTemplate
    };

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update.'
      });
    }

    // Upsert (update or insert)
    const result = await query(
      `INSERT INTO application_preferences (user_id, ${Object.keys(fields).filter(f => fields[f] !== undefined).join(', ')})
       VALUES ($1, ${params.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (user_id) 
       DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
       RETURNING *`,
      params
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Preferences updated successfully.'
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences.'
    });
  }
});

/**
 * Add company to blacklist
 * POST /api/applications/preferences/blacklist/add
 */
router.post('/preferences/blacklist/add', authenticate, async (req, res) => {
  try {
    const { company } = req.body;

    if (!company) {
      return res.status(400).json({
        success: false,
        error: 'Company name is required.'
      });
    }

    const result = await query(
      `INSERT INTO application_preferences (user_id, blacklisted_companies)
       VALUES ($1, ARRAY[$2]::text[])
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         blacklisted_companies = array_append(
           COALESCE(application_preferences.blacklisted_companies, ARRAY[]::text[]),
           $2
         ),
         updated_at = NOW()
       WHERE NOT ($2 = ANY(COALESCE(application_preferences.blacklisted_companies, ARRAY[]::text[])))
       RETURNING blacklisted_companies`,
      [req.user.id, company]
    );

    res.json({
      success: true,
      data: {
        blacklistedCompanies: result.rows[0]?.blacklisted_companies || []
      },
      message: 'Company added to blacklist.'
    });

  } catch (error) {
    console.error('Add to blacklist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add company to blacklist.'
    });
  }
});

/**
 * Remove company from blacklist
 * POST /api/applications/preferences/blacklist/remove
 */
router.post('/preferences/blacklist/remove', authenticate, async (req, res) => {
  try {
    const { company } = req.body;

    if (!company) {
      return res.status(400).json({
        success: false,
        error: 'Company name is required.'
      });
    }

    const result = await query(
      `UPDATE application_preferences
       SET blacklisted_companies = array_remove(blacklisted_companies, $2),
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING blacklisted_companies`,
      [req.user.id, company]
    );

    res.json({
      success: true,
      data: {
        blacklistedCompanies: result.rows[0]?.blacklisted_companies || []
      },
      message: 'Company removed from blacklist.'
    });

  } catch (error) {
    console.error('Remove from blacklist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove company from blacklist.'
    });
  }
});

/**
 * Get form data answers (for pre-filling common questions)
 * GET /api/applications/preferences/form-data
 */
router.get('/preferences/form-data', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        work_authorization,
        availability,
        salary_expectations,
        relocation,
        custom_answers
       FROM application_preferences 
       WHERE user_id = $1`,
      [req.user.id]
    );

    // Get user info for basic form fields
    const userResult = await query(
      `SELECT full_name, email, phone FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = userResult.rows[0];
    const prefs = result.rows[0] || {};

    res.json({
      success: true,
      data: {
        personal: {
          fullName: user.full_name,
          email: user.email,
          phone: user.phone
        },
        workAuthorization: prefs.work_authorization || {},
        availability: prefs.availability || {},
        salaryExpectations: prefs.salary_expectations || {},
        relocation: prefs.relocation || {},
        customAnswers: prefs.custom_answers || {}
      }
    });

  } catch (error) {
    console.error('Get form data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get form data.'
    });
  }
});

/**
 * Update form data answers
 * PUT /api/applications/preferences/form-data
 */
router.put('/preferences/form-data', authenticate, async (req, res) => {
  try {
    const {
      workAuthorization,
      availability,
      salaryExpectations,
      relocation,
      customAnswers
    } = req.body;

    const updates = [];
    const params = [req.user.id];
    let paramCount = 1;

    if (workAuthorization !== undefined) {
      paramCount++;
      updates.push(`work_authorization = $${paramCount}`);
      params.push(JSON.stringify(workAuthorization));
    }

    if (availability !== undefined) {
      paramCount++;
      updates.push(`availability = $${paramCount}`);
      params.push(JSON.stringify(availability));
    }

    if (salaryExpectations !== undefined) {
      paramCount++;
      updates.push(`salary_expectations = $${paramCount}`);
      params.push(JSON.stringify(salaryExpectations));
    }

    if (relocation !== undefined) {
      paramCount++;
      updates.push(`relocation = $${paramCount}`);
      params.push(JSON.stringify(relocation));
    }

    if (customAnswers !== undefined) {
      paramCount++;
      updates.push(`custom_answers = $${paramCount}`);
      params.push(JSON.stringify(customAnswers));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No form data to update.'
      });
    }

    await query(
      `INSERT INTO application_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.user.id]
    );

    const result = await query(
      `UPDATE application_preferences
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      params
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Form data updated successfully.'
    });

  } catch (error) {
    console.error('Update form data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update form data.'
    });
  }
});

module.exports = router;
