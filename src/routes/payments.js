/**
 * Payment Routes (Stripe Integration)
 * POST /api/payments/create-checkout - Create Stripe checkout session
 * POST /api/payments/webhook - Handle Stripe webhooks
 * GET /api/payments/portal - Get customer portal URL
 * GET /api/payments/history - Get payment history
 */

const express = require('express');
const Stripe = require('stripe');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendSubscriptionEmail } = require('../services/email');

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price IDs (set these in your .env)
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
  lifetime: process.env.STRIPE_PRICE_LIFETIME
};

/**
 * Create checkout session
 * POST /api/payments/create-checkout
 */
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const { plan } = req.body; // monthly, annual, or lifetime
    
    if (!plan || !PRICE_IDS[plan]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan. Choose monthly, annual, or lifetime.'
      });
    }
    
    // Get or create Stripe customer
    let stripeCustomerId = null;
    
    const userResult = await query(
      'SELECT stripe_customer_id, email, full_name FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const user = userResult.rows[0];
    
    if (user.stripe_customer_id) {
      stripeCustomerId = user.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name || undefined,
        metadata: {
          userId: req.user.id
        }
      });
      
      stripeCustomerId = customer.id;
      
      // Save customer ID
      await query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomerId, req.user.id]
      );
    }
    
    // Create checkout session
    const sessionConfig = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_IDS[plan],
          quantity: 1
        }
      ],
      mode: plan === 'lifetime' ? 'payment' : 'subscription',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        userId: req.user.id,
        plan: plan
      }
    };
    
    // Add subscription-specific options
    if (plan !== 'lifetime') {
      sessionConfig.subscription_data = {
        metadata: {
          userId: req.user.id,
          plan: plan
        }
      };
    }
    
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
    
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session.'
    });
  }
});

/**
 * Stripe webhook handler
 * POST /api/payments/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('📩 Stripe webhook:', event.type);
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(session);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCancelled(subscription);
        break;
      }
      
      case 'invoice.paid': {
        const invoice = event.data.object;
        await handleInvoicePaid(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Get customer portal URL
 * GET /api/payments/portal
 */
router.get('/portal', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (!userResult.rows[0]?.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'No subscription found.'
      });
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: userResult.rows[0].stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/settings/billing`
    });
    
    res.json({
      success: true,
      data: {
        url: session.url
      }
    });
    
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get portal URL.'
    });
  }
});

/**
 * Get payment history
 * GET /api/payments/history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, amount, currency, status, payment_type, plan_type, created_at
       FROM payments 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: result.rows.map(p => ({
        ...p,
        amount: p.amount / 100 // Convert cents to dollars
      }))
    });
    
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment history.'
    });
  }
});

/**
 * Get current subscription status
 * GET /api/payments/subscription
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT subscription_status, subscription_type, subscription_ends_at, stripe_subscription_id
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    const user = result.rows[0];
    
    res.json({
      success: true,
      data: {
        status: user.subscription_status,
        type: user.subscription_type,
        endsAt: user.subscription_ends_at,
        isActive: ['pro', 'lifetime'].includes(user.subscription_status)
      }
    });
    
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status.'
    });
  }
});

// ============================================
// Webhook Handlers
// ============================================

async function handleCheckoutComplete(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  
  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }
  
  // Get user email for notification
  const userResult = await query(
    'SELECT email, full_name FROM users WHERE id = $1',
    [userId]
  );
  
  if (userResult.rows.length === 0) return;
  
  const user = userResult.rows[0];
  
  // Handle lifetime purchase (one-time payment)
  if (plan === 'lifetime') {
    await query(
      `UPDATE users SET 
        subscription_status = 'lifetime',
        subscription_type = 'lifetime',
        subscription_ends_at = NULL
       WHERE id = $1`,
      [userId]
    );
    
    // Record payment
    await query(
      `INSERT INTO payments (user_id, stripe_payment_intent_id, amount, currency, status, payment_type, plan_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, session.payment_intent, session.amount_total, 'usd', 'succeeded', 'one_time', 'lifetime']
    );
    
    // Send confirmation email
    sendSubscriptionEmail(user.email, user.full_name, 'lifetime').catch(console.error);
  }
  
  console.log(`✅ Checkout complete for user ${userId}, plan: ${plan}`);
}

async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  
  // Find user by Stripe customer ID
  const userResult = await query(
    'SELECT id, email, full_name FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  
  if (userResult.rows.length === 0) {
    console.error('No user found for customer:', customerId);
    return;
  }
  
  const user = userResult.rows[0];
  
  // Determine plan type from price
  let planType = 'monthly';
  if (subscription.items?.data?.[0]?.price?.id === PRICE_IDS.annual) {
    planType = 'annual';
  }
  
  // Update subscription status
  const status = subscription.status === 'active' ? 'pro' : 'free';
  const endsAt = subscription.current_period_end 
    ? new Date(subscription.current_period_end * 1000) 
    : null;
  
  await query(
    `UPDATE users SET 
      subscription_status = $1,
      subscription_type = $2,
      stripe_subscription_id = $3,
      subscription_ends_at = $4
     WHERE id = $5`,
    [status, planType, subscription.id, endsAt, user.id]
  );
  
  // Send email for new subscriptions
  if (subscription.status === 'active') {
    sendSubscriptionEmail(user.email, user.full_name, planType).catch(console.error);
  }
  
  console.log(`✅ Subscription updated for user ${user.id}: ${status} (${planType})`);
}

async function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;
  
  // Find user and downgrade to free
  await query(
    `UPDATE users SET 
      subscription_status = 'cancelled',
      subscription_type = NULL
     WHERE stripe_customer_id = $1`,
    [customerId]
  );
  
  console.log(`⚠️ Subscription cancelled for customer ${customerId}`);
}

async function handleInvoicePaid(invoice) {
  const customerId = invoice.customer;
  
  // Find user
  const userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  
  if (userResult.rows.length === 0) return;
  
  // Record payment
  await query(
    `INSERT INTO payments (user_id, stripe_invoice_id, amount, currency, status, payment_type, plan_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userResult.rows[0].id,
      invoice.id,
      invoice.amount_paid,
      invoice.currency,
      'succeeded',
      'subscription',
      invoice.lines?.data?.[0]?.price?.id === PRICE_IDS.annual ? 'annual' : 'monthly'
    ]
  );
  
  console.log(`💰 Invoice paid: ${invoice.id}`);
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  
  console.log(`❌ Payment failed for customer ${customerId}`);
  
  // You could send an email notification here
}

module.exports = router;
