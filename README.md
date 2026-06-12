# Gemini Pay (UCP) + Payments Prototype

This branch contains a prototype Node.js/Express scaffold that implements the minimal Universal Commerce Protocol (UCP) endpoints + webhook skeleton for Gemini Pay, plus Stripe and Coinbase Commerce integrations (test-mode). It also includes a helper to generate a JWK for signing session responses and webhooks in development.

Files added
- server.js — main Express server with UCP session/create/update/complete endpoints and webhooks for Stripe and Coinbase Commerce (and Square stub).
- package.json — dependencies and scripts
- .env.example — all required environment variable names and placeholders
- tools/generate_jwk.js — small utility to create a test JWK for development

Important: I did NOT add any real API keys. You must create accounts and add keys to your environment when running locally or deploying.

Quickstart (local)
1. Switch to branch and install dependencies
   git checkout feature/gemini-pay-scaffold
   npm install

2. Generate a dev JWK (used to sign responses)
   npm run gen-jwk
   This prints a PRIVATE_JWK_JSON and PUBLIC_JWKS. Copy the PRIVATE_JWK_JSON into your .env as a single-line JSON string.

3. Create a .env file from .env.example and fill values (see below for how to get keys)
   cp .env.example .env
   # edit .env and replace placeholders

4. Start server
   npm start

5. Expose to the internet for testing (so Stripe and Gemini developer consoles can call your endpoints):
   Use ngrok or similar to forward a public URL to your local server, then register that URL in your UCP profile and Stripe/Coinsbase webhook settings.
   Example: ngrok http 8080

Webhook setup (test)
- Stripe
  1. In Stripe Dashboard -> Developers -> Webhooks create an endpoint pointing to https://<public-url>/webhooks/stripe
  2. Copy the webhook signing secret (whsec_...) into STRIPE_WEBHOOK_SECRET in your .env
- Coinbase Commerce
  1. In Coinbase Commerce Dashboard -> Settings -> Webhooks add your endpoint https://<public-url>/webhooks/coinbase
  2. Copy the webhook shared secret into COINBASE_WEBHOOK_SECRET in your .env

How to obtain API keys (short)
- Stripe: https://dashboard.stripe.com/test/apikeys — get a Test Secret Key (sk_test_... ) and Publishable Key (pk_test_...)
- Square: Create a developer account and a Sandbox application to get ACCESS_TOKEN and LOCATION_ID
- Coinbase Commerce: https://commerce.coinbase.com — create an API key for hosted checkouts
- Gemini Pay / UCP: Requires merchant onboarding with Google/Gemini. You will publish a UCP profile json and a JWKS URL. For development you can test locally; for production you must register the UCP profile with Google/Gemini.

Security notes
- Never commit real secret keys into the repo. Use environment variables or a secrets manager.
- The included generate_jwk.js is for development only — for production generate and manage keys securely and publish a JWKS endpoint.

Next steps I can take for you
- Add Square Checkout implementation and webhook verification.
- Generate Samsung Wallet pass after webhook-confirmed payment and attach a secure download URL to the order record.
- Prepare a UCP profile JSON and host the JWKS URL; assist with Gemini merchant onboarding.

If you want me to wire live test-mode integrations and push the changes here, tell me which provider keys you will add as GitHub repository secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, COINBASE_COMMERCE_API_KEY, COINBASE_WEBHOOK_SECRET). I can then update the branch to use those secrets in CI if you want an automated test workflow.
