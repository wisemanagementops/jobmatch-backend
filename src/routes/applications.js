/**
 * JobMatch AI - Applications Routes (SIMPLIFIED - NO DATABASE)
 * This version returns mock data to verify routes work
 * Once working, we'll add database queries back
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

console.log('🔧 Loading SIMPLIFIED applications routes (NO DATABASE QUERIES)');

// ============================================
// APPLICATION QUEUE ENDPOINTS (SIMPLIFIED)
// ============================================

/**
 * Get user's application queue
 * GET /api/applications/queue
 */
router.get('/queue', authenticate, async (req, res) => {
  console.log('✅ GET /queue called - user:', req.user.email);
  console.log('   Query params:', req.query);
  
  try {
    // Return empty queue for now
    res.json({
      success: true,
      data: {
        queue: [],
        pagination: {
          total: 0,
          limit: 50,
          offset: 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Get queue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get application queue.'
    });
  }
});

/**
 * Get versions for a queue item
 * GET /api/applications/queue/:id/versions
 */
router.get('/queue/:id/versions', authenticate, async (req, res) => {
  console.log('✅ GET /queue/:id/versions called - ID:', req.params.id);
  
  try {
    // Return empty versions for now
    res.json({
      success: true,
      data: {
        resumeVersions: [],
        coverLetterVersions: []
      }
    });
  } catch (error) {
    console.error('❌ Get versions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document versions.'
    });
  }
});

/**
 * Add job to application queue
 * POST /api/applications/queue/add
 */
router.post('/queue/add', authenticate, async (req, res) => {
  console.log('✅ POST /queue/add called');
  console.log('   Body:', req.body);
  
  try {
    const { jobTitle, companyName, jobUrl } = req.body;

    // Basic validation
    if (!jobTitle || !companyName || !jobUrl) {
      return res.status(400).json({
        success: false,
        error: 'Job title, company name, and URL are required.'
      });
    }

    // Return mock success
    res.json({
      success: true,
      data: {
        id: 'mock-queue-id-123',
        jobTitle,
        companyName,
        jobUrl,
        status: 'pending',
        created_at: new Date().toISOString()
      },
      message: 'Job added to application queue successfully.'
    });
  } catch (error) {
    console.error('❌ Add to queue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add job to queue.'
    });
  }
});

/**
 * Approve application in queue
 * PUT /api/applications/queue/:id/approve
 */
router.put('/queue/:id/approve', authenticate, async (req, res) => {
  console.log('✅ PUT /queue/:id/approve called - ID:', req.params.id);
  
  try {
    res.json({
      success: true,
      data: {
        id: req.params.id,
        user_approved: true,
        status: 'ready'
      },
      message: 'Application approved.'
    });
  } catch (error) {
    console.error('❌ Approve error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve application.'
    });
  }
});

/**
 * Reject application in queue
 * PUT /api/applications/queue/:id/reject
 */
router.put('/queue/:id/reject', authenticate, async (req, res) => {
  console.log('✅ PUT /queue/:id/reject called - ID:', req.params.id);
  
  try {
    res.json({
      success: true,
      message: 'Application rejected.'
    });
  } catch (error) {
    console.error('❌ Reject error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject application.'
    });
  }
});

/**
 * Delete item from queue
 * DELETE /api/applications/queue/:id
 */
router.delete('/queue/:id', authenticate, async (req, res) => {
  console.log('✅ DELETE /queue/:id called - ID:', req.params.id);
  
  try {
    res.json({
      success: true,
      message: 'Queue item deleted.'
    });
  } catch (error) {
    console.error('❌ Delete queue item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete queue item.'
    });
  }
});

/**
 * Bulk approve applications
 * POST /api/applications/queue/bulk-approve
 */
router.post('/queue/bulk-approve', authenticate, async (req, res) => {
  console.log('✅ POST /queue/bulk-approve called');
  console.log('   Queue IDs:', req.body.queueIds);
  
  try {
    const { queueIds } = req.body;

    if (!Array.isArray(queueIds) || queueIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Queue IDs array is required.'
      });
    }

    res.json({
      success: true,
      data: {
        approved: queueIds.length
      },
      message: `${queueIds.length} applications approved.`
    });
  } catch (error) {
    console.error('❌ Bulk approve error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve applications.'
    });
  }
});

/**
 * Update selected versions for a queue item
 * PUT /api/applications/queue/:id/select-version
 */
router.put('/queue/:id/select-version', authenticate, async (req, res) => {
  console.log('✅ PUT /queue/:id/select-version called');
  console.log('   ID:', req.params.id);
  console.log('   Body:', req.body);
  
  try {
    const { resumeVersionId, coverLetterVersionId } = req.body;

    if (!resumeVersionId && !coverLetterVersionId) {
      return res.status(400).json({
        success: false,
        error: 'No version IDs provided.'
      });
    }

    res.json({
      success: true,
      data: {
        id: req.params.id,
        resume_version_id: resumeVersionId,
        cover_letter_id: coverLetterVersionId
      },
      message: 'Document versions updated.'
    });
  } catch (error) {
    console.error('❌ Update versions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update document versions.'
    });
  }
});

// ============================================
// APPLICATIONS ENDPOINTS (SIMPLIFIED)
// ============================================

/**
 * Get all applications
 * GET /api/applications
 */
router.get('/', authenticate, async (req, res) => {
  console.log('✅ GET /applications called');
  
  try {
    res.json({
      success: true,
      data: {
        applications: [],
        pagination: {
          total: 0,
          limit: 50,
          offset: 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Get applications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get applications.'
    });
  }
});

/**
 * Get single application
 * GET /api/applications/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  console.log('✅ GET /applications/:id called - ID:', req.params.id);
  
  try {
    res.json({
      success: true,
      data: {
        id: req.params.id,
        job_title: 'Mock Job',
        company_name: 'Mock Company',
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('❌ Get application error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get application.'
    });
  }
});

/**
 * Update application
 * PUT /api/applications/:id
 */
router.put('/:id', authenticate, async (req, res) => {
  console.log('✅ PUT /applications/:id called - ID:', req.params.id);
  
  try {
    res.json({
      success: true,
      data: {
        id: req.params.id,
        ...req.body
      },
      message: 'Application updated.'
    });
  } catch (error) {
    console.error('❌ Update application error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update application.'
    });
  }
});

/**
 * Get application statistics
 * GET /api/applications/stats/summary
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  console.log('✅ GET /applications/stats/summary called');
  
  try {
    res.json({
      success: true,
      data: {
        overview: {
          total: 0,
          pending: 0,
          interviewing: 0,
          offered: 0,
          rejected: 0
        },
        monthly: [],
        topCompanies: []
      }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get application statistics.'
    });
  }
});

console.log('✅ Applications routes loaded (SIMPLIFIED VERSION - NO DATABASE)');

module.exports = router;
