/*
  server.js
  UCP / Gemini Pay endpoints + Stripe and Coinbase Commerce integrations
  + Loyalty pass generator (simulated) for local testing without provider keys
*/
import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { SignJWT, importJWK } from 'jose';
import axios from 'axios';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const MERCHANT_ID = process.env.MERCHANT_ID || 'demo-merchant';
const PRIVATE_JWK_JSON = process.env.PRIVATE_JWK_JSON || null;

// Payment SDKs / secrets
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2022-11-15' }) : null;

const COINBASE_KEY = process.env.COINBASE_COMMERCE_API_KEY || '';
const COINBASE_WEBHOOK_SECRET = process.env.COINBASE_WEBHOOK_SECRET || '';

const app = express();

// Ensure passes directory exists for generated loyalty passes (dev only)
const PASSES_DIR = path.join(process.cwd(), 'passes');
if (!fs.existsSync(PASSES_DIR)) fs.mkdirSync(PASSES_DIR, { recursive: true });

// Stripe webhook needs the raw body to verify signature. Register this route BEFORE express.json()
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(400).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe webhook event:', event.type);
  // Handle checkout.session.completed or payment_intent.succeeded
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // TODO: mark order completed by session.client_reference_id or metadata
    console.log('Checkout completed for session:', session.id);
  }

  res.json({ received: true });
});

// Coinbase Commerce webhook also requires raw body for HMAC verification
app.post('/webhooks/coinbase', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!COINBASE_KEY) return res.status(400).send('Coinbase Commerce not configured');
  const signature = req.headers['x-cc-webhook-signature'] || req.headers['x-cc-signature'] || '';
  const payload = req.body; // Buffer

  try {
    // Verify HMAC SHA256 with your webhook shared secret
    if (!COINBASE_WEBHOOK_SECRET) {
      console.warn('No COINBASE_WEBHOOK_SECRET configured; skipping signature verification');
    } else {
      const computed = crypto.createHmac('sha256', COINBASE_WEBHOOK_SECRET).update(payload).digest('hex');
      if (computed !== signature) {
        console.error('Coinbase webhook signature mismatch');
        return res.status(400).send('Invalid signature');
      }
    }

    const event = JSON.parse(payload.toString());
    console.log('Coinbase webhook event:', event.event?.type || event.type);
    // Handle charge:confirmed or charge:pending etc.
    if (event.event?.type === 'charge:confirmed' || event.event?.type === 'charge:resolved') {
      const charge = event.event.data;
      console.log('Charge confirmed:', charge.code);
      // TODO: mark order completed using metadata or hosted_url info
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error handling coinbase webhook:', err);
    res.status(400).send('Bad Request');
  }
});

// JSON middleware for all other routes
app.use(express.json());

// Utilities for signing (JWS) using a local private JWK (dev only)
async function getSigner() {
  if (!PRIVATE_JWK_JSON) return null;
  try {
    const jwk = typeof PRIVATE_JWK_JSON === 'string' ? JSON.parse(PRIVATE_JWK_JSON) : PRIVATE_JWK_JSON;
    const key = await importJWK(jwk, 'RS256');
    return { key, kid: jwk.kid };
  } catch (err) {
    console.warn('Invalid PRIVATE_JWK_JSON, signing disabled');
    return null;
  }
}

async function signPayload(payload) {
  const signer = await getSigner();
  if (!signer) return null;
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: signer.kid })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .sign(signer.key);
}

// In-memory order store (for prototype/demo)
const orders = new Map();

// Utility: generate a simple loyalty pass JSON file for a completed order (dev only)
async function generateLoyaltyPass(order) {
  const now = new Date();
  const pass = {
    pass_type: 'loyalty',
    receiptId: order.receiptId,
    merchant: MERCHANT_ID,
    program_name: order.session?.merchant_name || MERCHANT_ID,
    cardholder_name: order.session?.customer_name || 'Guest',
    membership_number: order.receiptId,
    points_balance: order.points_balance ?? Math.floor(Math.random() * 1000),
    tier: order.tier || 'Bronze',
    barcode: { type: 'qr', value: `https://example.com/loyalty/${order.receiptId}` },
    issued_at: now.toISOString(),
    metadata: {
      sessionId: order.session?.id || null,
      completed_at: order.completed_at || now.toISOString(),
    },
  };

  const filePath = path.join(PASSES_DIR, `${order.receiptId}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(pass, null, 2), 'utf8');
  return `/wallet/loyalty/${order.receiptId}`; // endpoint to download the pass
}

// UCP session create (Gemini client will call this during checkout)
app.post('/ucp/session/create', async (req, res) => {
  const { cart } = req.body || {};
  const sessionId = `sess_${crypto.randomUUID()}`;
  const session = {
    id: sessionId,
    merchant: MERCHANT_ID,
    cart: cart || { items: [] },
    status: 'CREATED',
    created_at: new Date().toISOString(),
    merchant_session_endpoint: `${req.protocol}://${req.get('host')}/ucp/session/${sessionId}`,
  };
  const signature = await signPayload(session);
  orders.set(sessionId, { session, status: 'CREATED' });
  res.json({ session, signature });
});

// UCP session update
app.post('/ucp/session/update', (req, res) => {
  const { sessionId, updates } = req.body || {};
  if (!sessionId || !orders.has(sessionId)) return res.status(404).json({ error: 'unknown session' });
  const order = orders.get(sessionId);
  order.session = { ...order.session, ...updates, updated_at: new Date().toISOString() };
  orders.set(sessionId, order);
  res.json({ ok: true });
});

// UCP session complete (merchant finalizes)
app.post('/ucp/session/complete', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId || !orders.has(sessionId)) return res.status(404).json({ error: 'unknown session' });
  const order = orders.get(sessionId);
  order.status = 'COMPLETED';
  order.completed_at = new Date().toISOString();
  const receiptId = `rcpt_${crypto.randomUUID()}`;
  order.receiptId = receiptId;
  orders.set(sessionId, order);

  // Generate loyalty pass (dev/simulated)
  try {
    const passUrl = await generateLoyaltyPass(order);
    order.loyalty_pass_url = passUrl;
    orders.set(sessionId, order);
  } catch (err) {
    console.warn('Failed to generate loyalty pass:', err);
  }

  const completion = { sessionId, receiptId, status: 'COMPLETED', merchant: MERCHANT_ID };
  const signature = await signPayload(completion);
  res.json({ completion, signature, passUrl: order.loyalty_pass_url || null });
});

// Webhook receiver (Gemini / UCP events)
app.post('/webhooks/gemini', async (req, res) => {
  // NOTE: In production verify webhook signatures using the JWKS provided by Gemini / UCP
  const event = req.body;
  console.log('Webhook event:', event?.type || 'unknown', event);
  // Handle event types: order.completed, payment.succeeded, etc.
  if (event && event.type === 'order.completed' && event.sessionId) {
    const order = orders.get(event.sessionId);
    if (order) {
      order.status = 'COMPLETED';
      order.completed_at = new Date().toISOString();
      const receiptId = order.receiptId || `rcpt_${crypto.randomUUID()}`;
      order.receiptId = receiptId;
      // Generate loyalty pass
      try {
        const passUrl = await generateLoyaltyPass(order);
        order.loyalty_pass_url = passUrl;
      } catch (err) {
        console.warn('Failed to generate loyalty pass (webhook):', err);
      }
      orders.set(event.sessionId, order);
    }
  }
  res.json({ received: true });
});

// Stripe: create a Checkout Session (server-side)
app.post('/create-checkout/stripe', async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY in .env' });
  try {
    const { items, success_url, cancel_url, metadata } = req.body;
    // Convert items to Stripe line_items format if provided, otherwise create a single line item
    const line_items = (items && items.length)
      ? items.map(it => ({ price_data: { currency: it.currency || 'usd', product_data: { name: it.name }, unit_amount: Math.round((it.unit_amount || it.price || 0) * 100) }, quantity: it.quantity || 1 }))
      : [{ price_data: { currency: 'usd', product_data: { name: 'Order' }, unit_amount: 100 }, quantity: 1 }];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: success_url || `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.protocol}://${req.get('host')}/cancel`,
      metadata: metadata || {},
    });

    res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Stripe create-checkout error', err);
    res.status(500).json({ error: 'Stripe error', details: err.message });
  }
});

// Coinbase Commerce: create a hosted charge
app.post('/create-checkout/crypto', async (req, res) => {
  if (!COINBASE_KEY) return res.status(400).json({ error: 'Coinbase Commerce not configured. Set COINBASE_COMMERCE_API_KEY in .env' });
  try {
    const { name, description, local_price, metadata } = req.body;
    const data = {
      name: name || 'Order',
      description: description || 'Payment',
      local_price: local_price || { amount: '1.00', currency: 'USD' },
      pricing_type: 'fixed_price',
      metadata: metadata || {},
    };
    const resp = await axios.post('https://api.commerce.coinbase.com/charges', data, {
      headers: {
        'X-CC-Api-Key': COINBASE_KEY,
        'X-CC-Version': '2018-03-22',
        'Content-Type': 'application/json',
      }
    });

    const charge = resp.data.data;
    // hosted_url is where you redirect the customer to complete payment
    res.json({ hosted_url: charge.hosted_url, charge });
  } catch (err) {
    console.error('Coinbase create charge error', err?.response?.data || err.message);
    res.status(500).json({ error: 'Coinbase error', details: err?.response?.data || err.message });
  }
});

// Square stub (left as-is)
app.post('/create-checkout/square', async (req, res) => {
  // TODO: implement Square Checkout/Payments when SQUARE_ACCESS_TOKEN and LOCATION_ID are provided
  res.json({ url: `https://squareup.com/checkout/mock/${crypto.randomUUID()}` });
});

// Endpoint to download the generated loyalty pass (dev: serves JSON pass bundle)
app.get('/wallet/loyalty/:receiptId', async (req, res) => {
  const { receiptId } = req.params;
  const filePath = path.join(PASSES_DIR, `${receiptId}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'pass not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="loyalty-${receiptId}.json"`);
  res.sendFile(filePath);
});

// Dev helper: view order state
app.get('/order/:id', (req, res) => {
  const id = req.params.id;
  if (!orders.has(id)) return res.status(404).json({ error: 'not found' });
  res.json(orders.get(id));
});

app.listen(PORT, () => console.log(`UCP + payments prototype server listening on ${PORT}`));
