/**
 * Authentication Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * GET /api/auth/me
 * PATCH /api/auth/onboarding
 * POST /api/auth/extension-installed
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db');
const { authenticate, generateToken } = require('../middleware/auth');
const { sendEmail } = require('../services/email');

const router = express.Router();

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters.'
      });
    }
    
    // Check if email exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, email_verification_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, subscription_status, created_at`,
      [email.toLowerCase(), passwordHash, fullName || null, verificationToken]
    );
    
    const user = result.rows[0];
    
    // Generate JWT
    const token = generateToken(user.id);
    
    // Send verification email (async, don't wait)
    sendVerificationEmail(user.email, verificationToken).catch(console.error);
    
    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          subscription: user.subscription_status
        },
        token
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account. Please try again.'
    });
  }
});

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }
    
    // Find user
    const result = await query(
      `SELECT id, email, password_hash, full_name, subscription_status, subscription_type, 
              analyses_today, analyses_total
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }
    
    // Update last login
    await query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Generate JWT
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          subscription: user.subscription_status,
          subscriptionType: user.subscription_type,
          usage: {
            today: user.analyses_today,
            total: user.analyses_total
          }
        },
        token
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, subscription_status, subscription_type,
              subscription_ends_at, analyses_today, analyses_total,
              target_job_titles, target_locations, remote_preference,
              email_verified, created_at,
              onboarding_completed, onboarding_step, extension_installed, first_analysis_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }
    
    const user = result.rows[0];
    
    // Get limits based on subscription
    const limits = {
      free: 3,
      pro: 999999,
      lifetime: 999999
    };
    const dailyLimit = limits[user.subscription_status] || limits.free;
    
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        full_name: user.full_name,
        emailVerified: user.email_verified,
        subscription_status: user.subscription_status,
        subscription: {
          status: user.subscription_status,
          type: user.subscription_type,
          endsAt: user.subscription_ends_at
        },
        usage: {
          today: user.analyses_today,
          total: user.analyses_total,
          dailyLimit: dailyLimit,
          remaining: dailyLimit - user.analyses_today
        },
        analyses_today: user.analyses_today,
        analyses_total: user.analyses_total,
        preferences: {
          targetJobTitles: user.target_job_titles || [],
          targetLocations: user.target_locations || [],
          remotePreference: user.remote_preference
        },
        onboarding_completed: user.onboarding_completed || false,
        onboarding_step: user.onboarding_step || 'welcome',
        extension_installed: user.extension_installed || false,
        first_analysis_at: user.first_analysis_at,
        createdAt: user.created_at
      }
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user data.'
    });
  }
});

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required.'
      });
    }
    
    // Find user
    const result = await query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }
    
    const user = result.rows[0];
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour
    
    // Save token
    await query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
      [resetToken, resetExpires, user.id]
    );
    
    // Send reset email
    sendPasswordResetEmail(user.email, resetToken).catch(console.error);
    
    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process request.'
    });
  }
});

/**
 * Reset password
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required.'
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters.'
      });
    }
    
    // Find user with valid token
    const result = await query(
      `SELECT id FROM users 
       WHERE password_reset_token = $1 
       AND password_reset_expires > CURRENT_TIMESTAMP`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token.'
      });
    }
    
    const user = result.rows[0];
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Update password and clear reset token
    await query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );
    
    res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password.'
    });
  }
});

/**
 * Update user preferences
 * PUT /api/auth/preferences
 */
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { fullName, targetJobTitles, targetLocations, remotePreference } = req.body;
    
    await query(
      `UPDATE users SET 
        full_name = COALESCE($1, full_name),
        target_job_titles = COALESCE($2, target_job_titles),
        target_locations = COALESCE($3, target_locations),
        remote_preference = COALESCE($4, remote_preference)
       WHERE id = $5`,
      [fullName, targetJobTitles, targetLocations, remotePreference, req.user.id]
    );
    
    res.json({
      success: true,
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

// Helper functions
async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  await sendEmail({
    to: email,
    subject: 'Verify your JobMatch AI account',
    html: `
      <h2>Welcome to JobMatch AI!</h2>
      <p>Please click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">Verify Email</a></p>
      <p>If you didn't create an account, you can ignore this email.</p>
    `
  });
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  await sendEmail({
    to: email,
    subject: 'Reset your JobMatch AI password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, you can ignore this email.</p>
    `
  });
}

/**
 * Reset daily usage count (for testing/admin)
 * POST /api/auth/reset-usage
 */
router.post('/reset-usage', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE users SET analyses_today = 0, last_analysis_date = NULL WHERE id = $1`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      message: 'Daily usage count reset successfully'
    });
  } catch (error) {
    console.error('Reset usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset usage count'
    });
  }
});

// ============== ONBOARDING ROUTES ==============

/**
 * Update onboarding status
 * PATCH /api/auth/onboarding
 */
router.patch('/onboarding', authenticate, async (req, res) => {
  try {
    const { completed, step } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (completed !== undefined) {
      updates.push(`onboarding_completed = $${paramCount++}`);
      values.push(completed);
    }
    
    if (step !== undefined) {
      updates.push(`onboarding_step = $${paramCount++}`);
      values.push(step);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No updates provided' 
      });
    }

    values.push(req.user.id);
    
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update onboarding error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update onboarding status' 
    });
  }
});

/**
 * Mark extension as installed (called by extension)
 * POST /api/auth/extension-installed
 */
router.post('/extension-installed', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE users SET extension_installed = TRUE WHERE id = $1',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark extension installed error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update extension status' 
    });
  }
});

module.exports = router;
