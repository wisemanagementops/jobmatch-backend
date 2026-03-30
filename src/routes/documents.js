/**
 * JobMatch AI - Documents Routes
 * Handles resume versions and cover letters
 */

const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateTailoredResume, generateCoverLetter } = require('../services/ai');

const router = express.Router();

// ============================================
// RESUME VERSIONS
// ============================================

/**
 * Get all resume versions for user
 * GET /api/documents/resume-versions
 */
router.get('/resume-versions', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        rv.*,
        r.name as base_resume_name,
        COUNT(a.id) as application_count
       FROM resume_versions rv
       LEFT JOIN resumes r ON rv.base_resume_id = r.id
       LEFT JOIN applications a ON rv.id = a.resume_version_id
       WHERE rv.user_id = $1
       GROUP BY rv.id, r.name
       ORDER BY rv.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get resume versions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get resume versions.'
    });
  }
});

/**
 * Get resume versions for specific job
 * GET /api/documents/for-job/:jobId
 */
router.get('/for-job/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get resume version
    const resumeResult = await query(
      `SELECT * FROM resume_versions 
       WHERE user_id = $1 AND tailored_for_job_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, jobId]
    );

    // Get cover letter
    const coverLetterResult = await query(
      `SELECT * FROM cover_letters 
       WHERE user_id = $1 AND job_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, jobId]
    );

    res.json({
      success: true,
      data: {
        resume: resumeResult.rows[0] || null,
        coverLetter: coverLetterResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Get documents for job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get documents for job.'
    });
  }
});

/**
 * Save resume version
 * POST /api/documents/resume-version
 */
router.post('/resume-version', authenticate, async (req, res) => {
  try {
    const {
      baseResumeId,
      jobId,
      versionName,
      resumeText,
      resumeData,
      isTailored = true,
      tailoredForCompany,
      tailoredForRole,
      optimizationScore,
      atsScore
    } = req.body;

    if (!resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Resume text is required.'
      });
    }

    const result = await query(
      `INSERT INTO resume_versions (
        user_id, base_resume_id, version_name, is_tailored,
        tailored_for_job_id, tailored_for_company, tailored_for_role,
        resume_text, resume_data, optimization_score, ats_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        req.user.id,
        baseResumeId,
        versionName,
        isTailored,
        jobId,
        tailoredForCompany,
        tailoredForRole,
        resumeText,
        resumeData ? JSON.stringify(resumeData) : null,
        optimizationScore,
        atsScore
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Resume version saved successfully.'
    });

  } catch (error) {
    console.error('Save resume version error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save resume version.'
    });
  }
});

/**
 * Generate and save tailored resume
 * POST /api/documents/generate-resume
 */
router.post('/generate-resume', authenticate, async (req, res) => {
  try {
    const {
      jobId,
      baseResumeId,
      jobDescription,
      companyName,
      jobTitle,
      selectedSkills = [],
      quickWins = []
    } = req.body;

    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Job description is required.'
      });
    }

    // Get base resume
    const resumeResult = await query(
      `SELECT * FROM resumes WHERE id = $1 AND user_id = $2`,
      [baseResumeId, req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Base resume not found.'
      });
    }

    const baseResume = resumeResult.rows[0];

    // Generate tailored resume
    const tailoredResume = await generateTailoredResume(
      jobDescription,
      baseResume.raw_text,
      selectedSkills,
      quickWins
    );

    // Save as resume version
    const versionResult = await query(
      `INSERT INTO resume_versions (
        user_id, base_resume_id, version_name, is_tailored,
        tailored_for_job_id, tailored_for_company, tailored_for_role,
        resume_text
      ) VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7)
      RETURNING *`,
      [
        req.user.id,
        baseResumeId,
        `${companyName || 'Company'} - ${jobTitle || 'Position'}`,
        jobId,
        companyName,
        jobTitle,
        tailoredResume.resumeText
      ]
    );

    res.json({
      success: true,
      data: {
        version: versionResult.rows[0],
        changes: tailoredResume.changes
      },
      message: 'Tailored resume generated successfully.'
    });

  } catch (error) {
    console.error('Generate resume error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate tailored resume.'
    });
  }
});

/**
 * Delete resume version
 * DELETE /api/documents/resume-version/:id
 */
router.delete('/resume-version/:id', authenticate, async (req, res) => {
  try {
    // Check if resume version is in use
    const usageCheck = await query(
      `SELECT COUNT(*) as count FROM applications 
       WHERE resume_version_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete resume version that is in use by applications.'
      });
    }

    const result = await query(
      `DELETE FROM resume_versions 
       WHERE id = $1 AND user_id = $2 
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Resume version not found.'
      });
    }

    res.json({
      success: true,
      message: 'Resume version deleted.'
    });

  } catch (error) {
    console.error('Delete resume version error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete resume version.'
    });
  }
});

// ============================================
// COVER LETTERS
// ============================================

/**
 * Get all cover letters for user
 * GET /api/documents/cover-letters
 */
router.get('/cover-letters', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        cl.*,
        COUNT(a.id) as application_count
       FROM cover_letters cl
       LEFT JOIN applications a ON cl.id = a.cover_letter_id
       WHERE cl.user_id = $1
       GROUP BY cl.id
       ORDER BY cl.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get cover letters error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cover letters.'
    });
  }
});

/**
 * Save cover letter
 * POST /api/documents/cover-letter
 */
router.post('/cover-letter', authenticate, async (req, res) => {
  try {
    const {
      jobId,
      applicationId,
      letterText,
      companyName,
      jobTitle,
      tone = 'professional'
    } = req.body;

    if (!letterText) {
      return res.status(400).json({
        success: false,
        error: 'Cover letter text is required.'
      });
    }

    const wordCount = letterText.split(/\s+/).length;

    const result = await query(
      `INSERT INTO cover_letters (
        user_id, job_id, application_id, letter_text,
        company_name, job_title, tone, word_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        req.user.id,
        jobId,
        applicationId,
        letterText,
        companyName,
        jobTitle,
        tone,
        wordCount
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Cover letter saved successfully.'
    });

  } catch (error) {
    console.error('Save cover letter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save cover letter.'
    });
  }
});

/**
 * Generate and save cover letter
 * POST /api/documents/generate-cover-letter
 */
router.post('/generate-cover-letter', authenticate, async (req, res) => {
  try {
    const {
      jobId,
      jobDescription,
      resumeText,
      companyName,
      jobTitle,
      tone = 'professional'
    } = req.body;

    if (!jobDescription || !resumeText) {
      return res.status(400).json({
        success: false,
        error: 'Job description and resume text are required.'
      });
    }

    // Generate cover letter
    const letterText = await generateCoverLetter(
      jobDescription,
      resumeText,
      companyName,
      tone
    );

    // Save cover letter
    const wordCount = letterText.split(/\s+/).length;

    const result = await query(
      `INSERT INTO cover_letters (
        user_id, job_id, letter_text, company_name,
        job_title, tone, word_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        req.user.id,
        jobId,
        letterText,
        companyName,
        jobTitle,
        tone,
        wordCount
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Cover letter generated successfully.'
    });

  } catch (error) {
    console.error('Generate cover letter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate cover letter.'
    });
  }
});

/**
 * Delete cover letter
 * DELETE /api/documents/cover-letter/:id
 */
router.delete('/cover-letter/:id', authenticate, async (req, res) => {
  try {
    // Check if cover letter is in use
    const usageCheck = await query(
      `SELECT COUNT(*) as count FROM applications 
       WHERE cover_letter_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete cover letter that is in use by applications.'
      });
    }

    const result = await query(
      `DELETE FROM cover_letters 
       WHERE id = $1 AND user_id = $2 
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cover letter not found.'
      });
    }

    res.json({
      success: true,
      message: 'Cover letter deleted.'
    });

  } catch (error) {
    console.error('Delete cover letter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete cover letter.'
    });
  }
});

/**
 * Get document by ID (for downloading)
 * GET /api/documents/:type/:id
 */
router.get('/:type/:id', authenticate, async (req, res) => {
  try {
    const { type, id } = req.params;
    const { format = 'text' } = req.query;

    let result;
    if (type === 'resume') {
      result = await query(
        `SELECT * FROM resume_versions WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
    } else if (type === 'cover-letter') {
      result = await query(
        `SELECT * FROM cover_letters WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type.'
      });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found.'
      });
    }

    const document = result.rows[0];

    // Return appropriate format
    if (format === 'pdf' && document.pdf_url) {
      return res.redirect(document.pdf_url);
    } else if (format === 'docx' && document.docx_url) {
      return res.redirect(document.docx_url);
    } else {
      // Return text
      const text = type === 'resume' ? document.resume_text : document.letter_text;
      res.json({
        success: true,
        data: {
          text,
          metadata: {
            id: document.id,
            createdAt: document.created_at,
            wordCount: document.word_count
          }
        }
      });
    }

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document.'
    });
  }
});

module.exports = router;
