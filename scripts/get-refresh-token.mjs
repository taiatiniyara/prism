// get-refresh-token.mjs - Device Code Flow (no redirect URI needed)
import 'dotenv/config';

const CLIENT_ID = process.env.POWERBI_CLIENT_ID;
const TENANT_ID = process.env.POWERBI_TENANT_ID;
const SCOPE = 'https://analysis.windows.net/powerbi/api/.default offline_access';

console.log('Requesting device code...\n');

const deviceResp = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
  }
);

const deviceData = await deviceResp.json();

if (!deviceResp.ok) {
  console.error('Device code request failed:', JSON.stringify(deviceData, null, 2));
  process.exit(1);
}

console.log(`Go to: ${deviceData.verification_uri}`);
console.log(`Code:   ${deviceData.user_code}\n`);
console.log('Press Enter after you\'ve signed in and approved...\n');

// Wait for user to press Enter
process.stdin.setRawMode(true);
await new Promise(resolve => process.stdin.once('data', () => resolve()));
process.stdin.setRawMode(false);

// Exchange device code for tokens
console.log('Exchanging device code for tokens...');

const tokenResp = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceData.device_code,
    }),
  }
);

const tokenData = await tokenResp.json();

if (!tokenResp.ok) {
  console.error('Token exchange failed:', JSON.stringify(tokenData, null, 2));
  process.exit(1);
}

console.log('\n✅ SUCCESS! Add this to your .env:');
console.log(`POWERBI_REFRESH_TOKEN=${tokenData.refresh_token}`);
console.log(`\nAccess token: ${tokenData.access_token.slice(0, 30)}...`);
console.log(`Expires in: ${tokenData.expires_in}s`);
