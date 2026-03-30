/**
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { query } = require('../db');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please log in again.'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token.'
      });
    }
    
    // Get user from database
    const result = await query(
      'SELECT id, email, full_name, subscription_status, subscription_type, analyses_today, analyses_total FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found.'
      });
    }
    
    // Attach user to request
    req.user = result.rows[0];
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT id, email, full_name, subscription_status, subscription_type, analyses_today FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      req.user = result.rows.length > 0 ? result.rows[0] : null;
    } catch {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Check if user has pro subscription
 */
const requirePro = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }
  
  const { subscription_status } = req.user;
  
  if (subscription_status !== 'pro' && subscription_status !== 'lifetime') {
    return res.status(403).json({
      success: false,
      error: 'This feature requires a Pro subscription.',
      upgrade_url: '/pricing'
    });
  }
  
  next();
};

/**
 * Check usage limits
 * Currently disabled for development - always allows requests
 */
const checkUsageLimit = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }
  
  // For development, always allow requests
  // TODO: Re-enable limits for production
  req.usageInfo = { used: 0, limit: 999, remaining: 999 };
  next();
};

function getNextMidnight() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

/**
 * Generate JWT token for user
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = {
  authenticate,
  optionalAuth,
  requirePro,
  checkUsageLimit,
  generateToken
};
