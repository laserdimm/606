#!/usr/bin/env node
// tools/generate_jwk.js
// Generate an RSA JWK for development using jose
import { generateKeyPair } from 'jose/util/generate_key_pair.js';
import { exportJWK } from 'jose/key/export.js';

async function main() {
  // Generate an RSA key pair for RS256 (suitable for JWS/JWT signing)
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwkPriv = await exportJWK(privateKey);
  const jwkPub = await exportJWK(publicKey);
  // add required fields
  jwkPriv.kid = jwkPriv.kid || `dev-${Date.now()}`;
  jwkPub.kid = jwkPriv.kid;
  console.log('PRIVATE_JWK_JSON_PLACEHOLDER = ' + JSON.stringify(jwkPriv));
  console.log('\nPUBLIC_JWKS = ' + JSON.stringify({ keys: [jwkPub] }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
