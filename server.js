/*
  server.js
  Prototype UCP / Gemini Pay endpoints and payment stubs
*/
import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { SignJWT, importJWK } from 'jose';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MERCHANT_ID = process.env.MERCHANT_ID || 'demo-merchant';
const PRIVATE_JWK_JSON = process.env.PRIVATE_JWK_JSON || null;

// Payment stubs config (fill from .env)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY || '';
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
const COINBASE_KEY = process.env.COINBASE_COMMERCE_API_KEY || '';

const orders = new Map();

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

// UCP session create
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

  // TODO: after completion, generate Samsung Wallet pass and store link
  const completion = { sessionId, receiptId, status: 'COMPLETED', merchant: MERCHANT_ID };
  const signature = await signPayload(completion);
  res.json({ completion, signature });
});

// Webhook receiver (Gemini / UCP events)
app.post('/webhooks/gemini', async (req, res) => {
  // NOTE: In production verify webhook signatures using the JWKS provided by Gemini / UCP
  const event = req.body;
  console.log('Webhook event:', event?.type || 'unknown', event);
  if (event?.type === 'order.completed' && event.sessionId) {
    const order = orders.get(event.sessionId);
    if (order) {
      order.status = 'COMPLETED';
      orders.set(event.sessionId, order);
      // TODO: call Samsung Wallet pass generator and attach pass URL to order
    }
  }
  res.json({ received: true });
});

// Payment stubs (Stripe / Square / Coinbase) — these create a server-side checkout intent or hosted checkout
app.post('/create-checkout/stripe', async (req, res) => {
  // In a real integration you'd call Stripe to create a Checkout Session or PaymentIntent.
  // For prototyping we return a fake session URL.
  // If STRIPE_SECRET is set, you can add real Stripe integration here.
  const fakeUrl = 'https://checkout.stripe.mock/session/' + crypto.randomUUID();
  res.json({ url: fakeUrl });
});

app.post('/create-checkout/square', async (req, res) => {
  // Use Square SDK to create checkout in production. Here return a fake URL.
  const fakeUrl = 'https://squareup.com/checkout/mock/' + crypto.randomUUID();
  res.json({ url: fakeUrl });
});

app.post('/create-checkout/crypto', async (req, res) => {
  // Coinbase Commerce or other providers offer hosted checkout pages and webhooks.
  const fakeUrl = 'https://commerce.coinbase.com/checkout/mock/' + crypto.randomUUID();
  res.json({ url: fakeUrl });
});

// Dev helper: view order
app.get('/order/:id', (req, res) => {
  const id = req.params.id;
  if (!orders.has(id)) return res.status(404).json({ error: 'not found' });
  res.json(orders.get(id));
});

app.listen(PORT, () => console.log(`UCP prototype server listening on ${PORT}`));
