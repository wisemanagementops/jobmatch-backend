/**
 * Email Service - Notifications and Alerts
 */

const nodemailer = require('nodemailer');

// Create transporter
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

/**
 * Send an email
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const transport = getTransporter();
    
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"JobMatch AI" <noreply@jobmatch.ai>',
      to,
      subject,
      text: text || stripHtml(html),
      html
    });
    
    console.log('📧 Email sent:', info.messageId);
    return info;
    
  } catch (error) {
    console.error('❌ Email failed:', error.message);
    throw error;
  }
}

/**
 * Send job alert email
 */
async function sendJobAlertEmail(userEmail, userName, jobs) {
  const jobListHtml = jobs.map(job => `
    <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #1a1a1a;">
        <a href="${job.apply_url}" style="color: #6366F1; text-decoration: none;">${job.title}</a>
      </h3>
      <p style="margin: 0 0 8px 0; color: #666;">
        ${job.company} • ${job.location}
        ${job.salary_min ? ` • $${(job.salary_min / 1000).toFixed(0)}k - $${(job.salary_max / 1000).toFixed(0)}k` : ''}
      </p>
      <p style="margin: 0; color: #4CAF50; font-weight: bold;">
        Match Score: ${job.match_score}%
      </p>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366F1; margin: 0;">🎯 JobMatch AI</h1>
        <p style="color: #666; margin: 8px 0 0 0;">Your Daily Job Matches</p>
      </div>
      
      <p>Hi ${userName || 'there'}! 👋</p>
      
      <p>We found <strong>${jobs.length} new job${jobs.length !== 1 ? 's' : ''}</strong> that match your profile:</p>
      
      ${jobListHtml}
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL}/dashboard/jobs" 
           style="display: inline-block; background: #6366F1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          View All Matches
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center;">
        You're receiving this because you have job alerts enabled.<br>
        <a href="${process.env.FRONTEND_URL}/settings/alerts" style="color: #6366F1;">Manage your alerts</a> or 
        <a href="${process.env.FRONTEND_URL}/unsubscribe" style="color: #6366F1;">unsubscribe</a>
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `🎯 ${jobs.length} New Job${jobs.length !== 1 ? 's' : ''} Match Your Profile`,
    html
  });
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(userEmail, userName) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366F1; margin: 0;">🎉 Welcome to JobMatch AI!</h1>
      </div>
      
      <p>Hi ${userName || 'there'}! 👋</p>
      
      <p>Thanks for joining JobMatch AI. We're here to help you land your dream job faster.</p>
      
      <h3>Here's what you can do:</h3>
      <ul>
        <li><strong>Analyze job matches</strong> - See how well your resume matches any job</li>
        <li><strong>Get tailored resumes</strong> - AI-optimized for each application</li>
        <li><strong>Generate cover letters</strong> - Personalized and compelling</li>
        <li><strong>Set up job alerts</strong> - Get notified when matching jobs appear</li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/dashboard" 
           style="display: inline-block; background: #6366F1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Go to Dashboard
        </a>
      </div>
      
      <p>Questions? Just reply to this email - we're here to help!</p>
      
      <p>Best of luck with your job search,<br>
      <strong>The JobMatch AI Team</strong></p>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: '🎉 Welcome to JobMatch AI!',
    html
  });
}

/**
 * Send subscription confirmation email
 */
async function sendSubscriptionEmail(userEmail, userName, planType) {
  const planDetails = {
    monthly: { name: 'Pro Monthly', price: '$24/month' },
    annual: { name: 'Pro Annual', price: '$79/year' },
    lifetime: { name: 'Lifetime Access', price: '$149 one-time' }
  };

  const plan = planDetails[planType] || planDetails.monthly;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366F1; margin: 0;">🚀 You're Now Pro!</h1>
      </div>
      
      <p>Hi ${userName || 'there'}! 👋</p>
      
      <p>Thank you for upgrading to <strong>${plan.name}</strong> (${plan.price})!</p>
      
      <h3>You now have access to:</h3>
      <ul>
        <li>✅ <strong>Unlimited</strong> job analyses</li>
        <li>✅ <strong>Unlimited</strong> tailored resumes</li>
        <li>✅ <strong>Smart job alerts</strong> - jobs come to you</li>
        <li>✅ <strong>Priority support</strong></li>
        <li>✅ <strong>Advanced AI features</strong></li>
      </ul>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/dashboard" 
           style="display: inline-block; background: #6366F1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Start Using Pro Features
        </a>
      </div>
      
      <p>We're rooting for you! 🎯</p>
      
      <p>Best,<br>
      <strong>The JobMatch AI Team</strong></p>
    </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: '🚀 Welcome to JobMatch AI Pro!',
    html
  });
}

// Helper to strip HTML tags
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  sendEmail,
  sendJobAlertEmail,
  sendWelcomeEmail,
  sendSubscriptionEmail
};
