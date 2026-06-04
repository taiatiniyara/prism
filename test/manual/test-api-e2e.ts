// End-to-end test of the actual API endpoint
// Run with: npx tsx test-api-e2e.ts

import { config } from 'dotenv';
config();

const BASE_URL = 'http://localhost:3554';

interface TestResult {
  success: boolean;
  message: string;
  response?: string;
  error?: string;
}

async function testApiEndpoint(): Promise<TestResult> {
  console.log('🧪 Testing actual API endpoint...\n');

  // Step 1: Check if server is running
  console.log('1. Checking server status...');
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/ai/sessions`);
    if (healthCheck.status === 401) {
      console.log('   ✓ Server is running (auth required)\n');
    } else {
      return { success: false, message: `Unexpected status: ${healthCheck.status}` };
    }
  } catch (error: any) {
    return { success: false, message: 'Server not running', error: error.message };
  }

  // Step 2: Try to get a session cookie by logging in
  console.log('2. Attempting to authenticate...');
  console.log('   ⚠️  This test requires manual authentication.');
  console.log('   Please log in to the app in your browser first, then:');
  console.log('   1. Open browser DevTools (F12)');
  console.log('   2. Go to Application > Cookies');
  console.log('   3. Copy the "better-auth.session_token" cookie value');
  console.log('   4. Set it as SESSION_TOKEN environment variable\n');
  
  const sessionToken = process.env.SESSION_TOKEN;
  if (!sessionToken) {
    return { 
      success: false, 
      message: 'No session token provided. Set SESSION_TOKEN env var.' 
    };
  }

  console.log('   ✓ Session token provided\n');

  // Step 3: Make authenticated request to /api/ai/chat
  console.log('3. Making authenticated request to /api/ai/chat...');
  console.log('   Question: "What is my KPI status?"\n');

  try {
    const response = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `better-auth.session_token=${sessionToken}`,
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'What is my KPI status?' }
        ],
      }),
    });

    console.log(`   Status: ${response.status}`);
    console.log(`   Headers: X-Session-Id=${response.headers.get('X-Session-Id')}`);
    console.log(`   Headers: X-Model=${response.headers.get('X-Model')}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      return { 
        success: false, 
        message: `API returned ${response.status}`, 
        error: errorText 
      };
    }

    // Step 4: Consume the stream
    console.log('4. Consuming stream...\n');
    console.log('═'.repeat(80));
    console.log('💬 AI Response:');
    console.log('═'.repeat(80));

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      return { success: false, message: 'No response body' };
    }

    let fullContent = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunkCount++;
      const chunk = decoder.decode(value, { stream: true });
      fullContent += chunk;
      process.stdout.write(chunk);
    }

    console.log('\n═'.repeat(80));
    console.log(`\n✓ Stream complete`);
    console.log(`  Chunks received: ${chunkCount}`);
    console.log(`  Total length: ${fullContent.length} characters\n`);

    if (fullContent.length > 0) {
      return { 
        success: true, 
        message: 'Successfully received response',
        response: fullContent
      };
    } else {
      return { 
        success: false, 
        message: 'Received empty response' 
      };
    }

  } catch (error: any) {
    return { 
      success: false, 
      message: 'Request failed', 
      error: error.message 
    };
  }
}

async function main() {
  const result = await testApiEndpoint();

  console.log('\n' + '═'.repeat(80));
  console.log('📊 Test Result:');
  console.log('═'.repeat(80));
  console.log(`Status: ${result.success ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Message: ${result.message}`);
  
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  if (result.response && result.response.length > 0) {
    console.log(`\nResponse preview (${Math.min(200, result.response.length)} chars):`);
    console.log(result.response.substring(0, 200) + (result.response.length > 200 ? '...' : ''));
  }

  console.log('═'.repeat(80));

  if (!result.success) {
    console.log('\n💡 To run this test:');
    console.log('   1. Start the dev server: npm run dev');
    console.log('   2. Log in to http://localhost:3554 in your browser');
    console.log('   3. Copy the session token from browser cookies');
    console.log('   4. Run: SESSION_TOKEN=your_token npx tsx test-api-e2e.ts');
  }
}

main().catch(console.error);
