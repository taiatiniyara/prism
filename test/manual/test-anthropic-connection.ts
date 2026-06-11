// Test actual Anthropic API connection
// Run with: npx tsx test-anthropic-connection.ts

import { config } from "dotenv";
config();

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { AI_MODELS } from "../../lib/ai/types";

async function testAnthropicConnection() {
  console.log("Testing Anthropic Claude API Connection\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("✗ ANTHROPIC_API_KEY not found");
    return;
  }

  console.log(`Testing model: ${AI_MODELS.primary}\n`);

  try {
    const isThinkingModel = /^claude-sonnet-4/i.test(AI_MODELS.primary);
    const result = await generateText({
      model: anthropic(AI_MODELS.primary),
      prompt: 'Say "PRISM AI is working!" in exactly those words.',
      maxOutputTokens: 8000,
      ...(isThinkingModel
        ? { providerOptions: { anthropic: { thinking: { type: "enabled" as const, budgetTokens: 12000 } } } }
        : {}),
    });

    console.log("✓ Anthropic API connection successful!");
    console.log(`✓ Model: ${AI_MODELS.primary}`);
    console.log(`✓ Response: "${result.text}"`);
    console.log(
      `✓ Tokens used: ${result.usage?.inputTokens ?? 0} input, ${result.usage?.outputTokens ?? 0} output`,
    );
    console.log(`✓ Finish reason: ${result.finishReason}`);

    console.log("\nAnthropic API is fully functional!");
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log("✗ Anthropic API call failed:");
    console.log(`  Error: ${errMsg}`);

    if (errMsg.includes("API key") || errMsg.includes("authentication")) {
      console.log("  → Check your ANTHROPIC_API_KEY in .env");
    }
  }
}

testAnthropicConnection().catch(console.error);
