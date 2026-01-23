/**
 * JobMatch AI - Backend Server
 * 
 * Main entry point for the API server.
 * Handles authentication, AI analysis, payments, and job alerts.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { runMigrations } = require('./db/migrate');

// Import routes
const authRoutes = require('./routes/auth');
const analyzeRoutes = require('./routes/analyze');
const resumeRoutes = require('./routes/resumes');
const paymentRoutes = require('./routes/payments');
const jobRoutes = require('./routes/jobs');
const extensionRoutes = require('./routes/extension');
const applicationsRoutes = require('./routes/applications');
const preferencesRoutes = require('./routes/preferences');
const documentsRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Allowed origins - EXPLICIT LIST for production
const ALLOWED_ORIGINS = [
  // Production frontend
  'https://jobmatch-frontend-one.vercel.app',
  // Add any other Vercel preview URLs if needed
  // 'https://jobmatch-frontend-*.vercel.app',
];

// Add FRONTEND_URL from environment if set
if (process.env.FRONTEND_URL) {
  // Remove trailing slash if present for consistent matching
  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, '');
  if (!ALLOWED_ORIGINS.includes(frontendUrl)) {
    ALLOWED_ORIGINS.push(frontendUrl);
  }
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Log for debugging (remove in production if too verbose)
    console.log(`[CORS] Request from origin: ${origin}`);
    
    // Allow requests with no origin (mobile apps, curl, Postman, etc)
    if (!origin) {
      console.log('[CORS] No origin - allowing');
      return callback(null, true);
    }
    
    // Allow localhost for development
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      console.log('[CORS] Localhost - allowing');
      return callback(null, true);
    }
    
    // Allow Chrome extensions
    if (origin.startsWith('chrome-extension://')) {
      console.log('[CORS] Chrome extension - allowing');
      return callback(null, true);
    }
    
    // Check against allowed origins list
    if (ALLOWED_ORIGINS.includes(origin)) {
      console.log('[CORS] Matched allowed origin - allowing');
      return callback(null, true);
    }
    
    // Allow any Vercel preview deployments for your project
    if (origin.includes('vercel.app') && origin.includes('jobmatch')) {
      console.log('[CORS] Vercel preview URL - allowing');
      return callback(null, true);
    }
    
    // Reject unknown origins in production
    console.log(`[CORS] Origin not allowed: ${origin}`);
    console.log(`[CORS] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: 86400, // 24 hours - browsers can cache preflight response
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Explicit OPTIONS handler for preflight requests (belt and suspenders)
app.options('*', cors(corsOptions));

// Body parsing (except for Stripe webhooks which need raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected',
      cors_origins: ALLOWED_ORIGINS
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}); 

// ============================================
// API ROUTES
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/applications', preferencesRoutes);
app.use('/api/documents', documentsRoutes);

// ============================================
// API DOCUMENTATION
// ============================================

app.get('/api', (req, res) => {
  res.json({
    name: 'JobMatch AI API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Create new account',
        'POST /api/auth/login': 'Login',
        'GET /api/auth/me': 'Get current user',
        'POST /api/auth/forgot-password': 'Request password reset',
        'POST /api/auth/reset-password': 'Reset password',
        'PUT /api/auth/preferences': 'Update preferences'
      },
      analyze: {
        'POST /api/analyze': 'Analyze job-resume match',
        'POST /api/analyze/tailor': 'Generate tailored resume',
        'POST /api/analyze/cover-letter': 'Generate cover letter',
        'GET /api/analyze/history': 'Get analysis history',
        'GET /api/analyze/:id': 'Get single analysis',
        'DELETE /api/analyze/:id': 'Delete analysis'
      },
      resumes: {
        'GET /api/resumes': 'Get all resumes',
        'POST /api/resumes': 'Create resume',
        'GET /api/resumes/:id': 'Get single resume',
        'PUT /api/resumes/:id': 'Update resume',
        'DELETE /api/resumes/:id': 'Delete resume',
        'POST /api/resumes/:id/primary': 'Set as primary',
        'POST /api/resumes/builder/start': 'Start guided builder',
        'POST /api/resumes/builder/message': 'Send builder message',
        'POST /api/resumes/builder/complete': 'Complete and save',
        'POST /api/resumes/builder/bullet': 'Generate bullet point'
      },
      payments: {
        'POST /api/payments/create-checkout': 'Create Stripe checkout',
        'GET /api/payments/portal': 'Get billing portal URL',
        'GET /api/payments/subscription': 'Get subscription status',
        'GET /api/payments/history': 'Get payment history'
      },
      jobs: {
        'GET /api/jobs/alerts': 'Get job alerts',
        'POST /api/jobs/alerts': 'Create job alert',
        'PUT /api/jobs/alerts/:id': 'Update job alert',
        'DELETE /api/jobs/alerts/:id': 'Delete job alert',
        'GET /api/jobs/matches': 'Get matched jobs',
        'GET /api/jobs/matches/:id': 'Get job detail',
        'POST /api/jobs/matches/:id/action': 'Job action (save/apply/dismiss)'
      },
      applications: {
        'POST /api/applications/queue/add': 'Add job to queue',
        'GET /api/applications/queue': 'Get application queue',
        'PUT /api/applications/queue/:id/approve': 'Approve application',
        'PUT /api/applications/queue/:id/reject': 'Reject application',
        'GET /api/applications': 'Get all applications',
        'GET /api/applications/:id': 'Get application details',
        'PUT /api/applications/:id': 'Update application',
        'GET /api/applications/stats/summary': 'Get statistics'
      },
      documents: {
        'GET /api/documents/resume-versions': 'Get resume versions',
        'POST /api/documents/generate-resume': 'Generate tailored resume',
        'POST /api/documents/generate-cover-letter': 'Generate cover letter',
        'GET /api/documents/for-job/:jobId': 'Get documents for job'
      },
      preferences: {
        'GET /api/applications/preferences': 'Get preferences',
        'PUT /api/applications/preferences': 'Update preferences'
      }
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  
  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS: Origin not allowed',
      origin: req.headers.origin
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ============================================
// SCHEDULED TASKS (for job alerts)
// ============================================

// Reset daily usage counts at midnight
const resetDailyUsage = async () => {
  try {
    await pool.query(`
      UPDATE users SET analyses_today = 0 
      WHERE last_analysis_date < CURRENT_DATE
    `);
    console.log('✅ Daily usage counts reset');
  } catch (error) {
    console.error('❌ Failed to reset daily usage:', error);
  }
};

// Run at startup and every hour
resetDailyUsage();
setInterval(resetDailyUsage, 60 * 60 * 1000);

// ============================================
// START SERVER
// ============================================

const startServer = async () => {
  // Run database migrations
  await runMigrations();
  
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       🎯 JobMatch AI API Server                           ║
║                                                           ║
║       Running on: http://localhost:${PORT}                  ║
║       Environment: ${process.env.NODE_ENV || 'development'}                       ║
║                                                           ║
║       Allowed CORS Origins:                               ║
${ALLOWED_ORIGINS.map(o => `║         - ${o.padEnd(45)}║`).join('\n')}
║                                                           ║
║       Endpoints: /api                                     ║
║       Health: /health                                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down...');
  await pool.end();
  process.exit(0);
});

module.exports = app;
