// Test actual OpenAI API connection
// Run with: npx tsx test-openai-connection.ts

import { config } from 'dotenv';
config();

import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { AI_MODELS } from '../../lib/ai/types';

async function testOpenAIConnection() {
  console.log('🔌 Testing OpenAI API Connection\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('✗ OPENAI_API_KEY not found');
    return;
  }

  console.log(`Testing model: ${AI_MODELS.primary}\n`);

  try {
    const result = await generateText({
      model: openai(AI_MODELS.primary),
      prompt: 'Say "PRISM AI is working!" in exactly those words.',
      maxOutputTokens: 8000,
      ...(AI_MODELS.primary.startsWith('gpt-5') || AI_MODELS.primary.startsWith('o')
        ? { providerOptions: { openai: { reasoningEffort: 'low' as const } } }
        : {}),
    });

    console.log('✓ OpenAI API connection successful!');
    console.log(`✓ Model: ${AI_MODELS.primary}`);
    console.log(`✓ Response: "${result.text}"`);
    console.log(`✓ Tokens used: ${result.usage?.inputTokens ?? 0} input, ${result.usage?.outputTokens ?? 0} output`);
    console.log(`✓ Finish reason: ${result.finishReason}`);
    
    console.log('\n🎉 OpenAI API is fully functional!');
  } catch (error: any) {
    console.log('✗ OpenAI API call failed:');
    console.log(`  Error: ${error.message}`);
    
    if (error.message?.includes('API key')) {
      console.log('  → Check your OPENAI_API_KEY in .env');
    } else if (error.message?.includes('model')) {
      console.log('  → The model may not be available. Try gpt-4o instead.');
    } else if (error.message?.includes('rate')) {
      console.log('  → Rate limited. Wait a moment and try again.');
    }
  }
}

testOpenAIConnection().catch(console.error);
