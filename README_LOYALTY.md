## Loyalty pass testing (local, simulated)

This branch now supports generating a simulated loyalty pass when a UCP session is completed (via /ucp/session/complete) or when a simulated webhook (POST /webhooks/gemini) with type 'order.completed' is sent.

Quick simulated test (no API keys required):

1. Start server:
   npm install
   npm start

2. Create a UCP session:
   curl -X POST http://localhost:8080/ucp/session/create -H "Content-Type: application/json" -d '{"cart":{"items":[{"name":"Test","unit_amount":9.99,"quantity":1}]}}' | jq

3. Complete the session (merchant finalize):
   curl -X POST http://localhost:8080/ucp/session/complete -H "Content-Type: application/json" -d '{"sessionId":"<SESSION_ID>"}' | jq

   The response includes passUrl. You can download the loyalty pass JSON at that URL, for example:
   curl http://localhost:8080/wallet/loyalty/<RECEIPT_ID>

Note: This is a development prototype. For real Samsung Wallet integration the pass must be packaged and signed according to Samsung Wallet documentation and delivered in the correct format for the device.
