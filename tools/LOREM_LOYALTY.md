# Loyalty pass (simulated) generation

This small helper is intentionally simple: it creates a JSON loyalty pass and writes it to the `passes/` directory so the server can serve it at `/wallet/loyalty/:receiptId`.

The format is a prototype only for local testing. Real Samsung Wallet passes require platform-specific packaging and signing (PKCS7/PKCS12 or JWK flows) which we do not implement here.

You can customize fields in server.js -> generateLoyaltyPass(order).
