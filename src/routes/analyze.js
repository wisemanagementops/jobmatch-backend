/**
 * AI Analysis Routes
 * POST /api/analyze - Analyze job-resume match
 * POST /api/analyze/tailor - Generate tailored resume
 * POST /api/analyze/cover-letter - Generate cover letter
 * GET /api/analyze/history - Get analysis history
 */

const express = require('express');
const { query } = require('../db');
const { authenticate, optionalAuth, checkUsageLimit } = require('../middleware/auth');
const { analyzeMatch, generateTailoredResume, generateCoverLetter } = require('../services/ai');

const router = express.Router();

/**
 * Analyze job-resume match
 * POST /api/analyze
 */
router.post('/', authenticate, checkUsageLimit, async (req, res) => {
  try {
    const { jobDescription, resumeText, jobTitle, companyName, jobUrl, jobLocation } = req.body;
    
    // Validation
    if (!jobDescription || !resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Job description and resume text are required.'
      });
    }
    
    // Call AI service
    const analysisResult = await analyzeMatch(jobDescription, resumeText);
    
    // Helper to check if a value is a generic placeholder
    const isGenericValue = (val) => {
      if (!val) return true;
      const generic = ['job posting', 'unknown company', 'untitled', 'untitled job', 'n/a', 'unknown'];
      return generic.includes(val.toLowerCase().trim());
    };
    
    // Use AI-extracted values if frontend sent generic placeholders
    const finalJobTitle = isGenericValue(jobTitle) 
      ? (analysisResult.jobTitle || 'Job Position') 
      : jobTitle;
    const finalCompanyName = isGenericValue(companyName) 
      ? (analysisResult.companyName || 'Company') 
      : companyName;
    
    // Save analysis to database
    const saveResult = await query(
      `INSERT INTO analyses 
        (user_id, job_title, company_name, job_url, job_description, job_location,
         match_score, ats_score, analysis_result, matching_skills, missing_skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        req.user.id,
        finalJobTitle,
        finalCompanyName,
        jobUrl,
        jobDescription,
        jobLocation,
        analysisResult.overall_match_score,
        analysisResult.ats_optimization?.estimated_ats_score || Math.round(analysisResult.overall_match_score * 0.8),
        JSON.stringify(analysisResult),
        analysisResult.skills_analysis?.matching_skills || [],
        analysisResult.skills_analysis?.missing_skills || []
      ]
    );
    
    // Add extracted title/company to the result for the extension to use
    analysisResult.extractedJobTitle = finalJobTitle;
    analysisResult.extractedCompanyName = finalCompanyName;
    
    // Update usage count
    const today = new Date().toISOString().split('T')[0];
    await query(
      `UPDATE users SET 
        analyses_today = CASE 
          WHEN last_analysis_date = $1 THEN analyses_today + 1
          ELSE 1
        END,
        analyses_total = analyses_total + 1,
        last_analysis_date = $1
       WHERE id = $2`,
      [today, req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        analysisId: saveResult.rows[0].id,
        result: analysisResult,
        usage: {
          used: req.usageInfo.used + 1,
          remaining: req.usageInfo.remaining - 1,
          limit: req.usageInfo.limit
        }
      }
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed. Please try again.'
    });
  }
});

/**
 * Generate tailored resume
 * POST /api/analyze/tailor
 */
router.post('/tailor', authenticate, checkUsageLimit, async (req, res) => {
  try {
    const { analysisId, jobDescription, resumeText, selectedSkills, quickWins } = req.body;
    
    if (!jobDescription || !resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Job description and resume text are required.'
      });
    }
    
    // Generate tailored resume
    const tailoredResume = await generateTailoredResume(
      jobDescription,
      resumeText,
      selectedSkills || [],
      quickWins || []
    );
    
    // Re-analyze the tailored resume
    const improvedAnalysis = await analyzeMatch(jobDescription, tailoredResume.resumeText);
    
    // Update analysis record if analysisId provided
    if (analysisId) {
      await query(
        `UPDATE analyses SET 
          tailored_resume_text = $1,
          tailored_resume_score = $2
         WHERE id = $3 AND user_id = $4`,
        [tailoredResume.resumeText, improvedAnalysis.overall_match_score, analysisId, req.user.id]
      );
    }
    
    // Update usage count
    const today = new Date().toISOString().split('T')[0];
    await query(
      `UPDATE users SET 
        analyses_today = CASE 
          WHEN last_analysis_date = $1 THEN analyses_today + 1
          ELSE 1
        END,
        analyses_total = analyses_total + 1,
        last_analysis_date = $1
       WHERE id = $2`,
      [today, req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        tailoredResume: tailoredResume.resumeText,
        improvedScore: improvedAnalysis.overall_match_score,
        improvedAtsScore: improvedAnalysis.ats_optimization?.estimated_ats_score,
        changes: tailoredResume.changes
      }
    });
    
  } catch (error) {
    console.error('Tailor error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate tailored resume.'
    });
  }
});

/**
 * Generate cover letter
 * POST /api/analyze/cover-letter
 */
router.post('/cover-letter', authenticate, checkUsageLimit, async (req, res) => {
  try {
    const { analysisId, jobDescription, resumeText, companyName, tone } = req.body;
    
    if (!jobDescription || !resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Job description and resume text are required.'
      });
    }
    
    // Generate cover letter
    const coverLetter = await generateCoverLetter(
      jobDescription,
      resumeText,
      companyName,
      tone || 'professional'
    );
    
    // Update analysis record if analysisId provided
    if (analysisId) {
      await query(
        `UPDATE analyses SET cover_letter = $1 WHERE id = $2 AND user_id = $3`,
        [coverLetter, analysisId, req.user.id]
      );
    }
    
    res.json({
      success: true,
      data: {
        coverLetter
      }
    });
    
  } catch (error) {
    console.error('Cover letter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cover letter.'
    });
  }
});

/**
 * Get analysis history
 * GET /api/analyze/history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT id, job_title, company_name, job_url, job_location,
              match_score, ats_score, matching_skills, missing_skills,
              tailored_resume_score, cover_letter IS NOT NULL as has_cover_letter,
              created_at
       FROM analyses 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );
    
    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM analyses WHERE user_id = $1',
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        analyses: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis history.'
    });
  }
});

/**
 * Get single analysis detail
 * GET /api/analyze/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM analyses WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found.'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis.'
    });
  }
});

/**
 * Delete analysis
 * DELETE /api/analyze/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM analyses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Analysis not found.'
      });
    }
    
    res.json({
      success: true,
      message: 'Analysis deleted.'
    });
    
  } catch (error) {
    console.error('Delete analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete analysis.'
    });
  }
});

module.exports = router;
