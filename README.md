# Gemini Pay (UCP) + Payments Prototype

This branch contains a prototype Node.js/Express scaffold that implements the minimal Universal Commerce Protocol (UCP) endpoints + webhook skeleton for Gemini Pay, plus stubs for Stripe, Square and Coinbase Commerce. It also includes a helper to generate a JWK for signing session responses and webhooks in development.

Files added
- server.js — main Express server with UCP session/create/update/complete endpoints and webhook receiver
- package.json — dependencies and scripts
- .env.example — example environment variables for API keys and signing keys
- tools/generate_jwk.js — small utility to create a test JWK for development
- README.md (this file)

Important: I did NOT add any real API keys. You must create accounts and add keys to your environment when running locally or deploying.

Quickstart (local)
1. Install dependencies
   npm install

2. Generate a development JWK (used to sign responses)
   npm run gen-jwk
   This prints a JWK JSON to stdout. Copy it into your .env as PRIVATE_JWK_JSON (JSON string) or host a JWKS URL for Gemini (recommended for production).

3. Create a .env file from .env.example and fill values (see below for how to get keys)
   cp .env.example .env
   # edit .env and replace placeholders

4. Start server
   npm start

5. Expose to the internet for Gemini/dev registration
   Use ngrok or similar to forward a public URL to your local server, then register that URL in your UCP profile.
   Example: ngrok http 8080

How to obtain API keys (short)
- Stripe: https://dashboard.stripe.com/test/apikeys — get a Test Secret Key (sk_test_... ) and Publishable Key (pk_test_...)
- Square: Create a developer account and a Sandbox application to get ACCESS_TOKEN and LOCATION_ID
- Coinbase Commerce: https://commerce.coinbase.com — create an API key for hosted checkouts
- Gemini Pay / UCP: Requires merchant onboarding with Google/Gemini. You will publish a UCP profile JSON (publicly hosted) and provide a JWKS URL containing your public signing keys. See UCP docs: https://developers.google.com/merchant/ucp/guide

Security notes
- Never commit real secret keys into the repo. Use environment variables or a secrets manager.
- The included generate_jwk.js is for development only — for production generate and manage keys securely and publish a JWKS endpoint.

Next steps I can take for you
- Wire real Stripe / Square / Coinbase Commerce integration flows (I left stubs to add). If you provide API keys I can integrate test-mode flows.
- Help prepare a UCP profile JSON and show how to host a JWKS endpoint.
- Create a Samsung Wallet pass generator and hook it into the webhook flow to return an Add-to-Wallet link.

