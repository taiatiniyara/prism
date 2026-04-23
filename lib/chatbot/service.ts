import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { CHATBOT_SYSTEM_PROMPT } from "./prompt";
import { resolveChatbotCapabilities } from "./capabilities";
import type {
  ChatMessageInput,
  ChatbotCapabilityName,
  ChatbotRecommendedView,
} from "./types";

const normalizeMessage = (message: ChatMessageInput): ChatMessageInput => {
  return {
    role: message.role,
    content: message.content.trim(),
  };
};

interface PreparedChatbotRequest {
  model: string;
  safeMessages: ChatMessageInput[];
  systemPrompt: string;
  maxOutputTokens: number;
  capabilityContext: {
    capabilitiesUsed: ChatbotCapabilityName[];
    recommendedView: ChatbotRecommendedView;
  };
  abortController: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
}

const prepareChatbotRequest = async (
  messages: ChatMessageInput[],
  user: CurrentUser,
): Promise<PreparedChatbotRequest> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = "gpt-5";
  const timeoutMs = Number(process.env.CHATBOT_TIMEOUT_MS ?? "45000");
  const maxHistory = Number(process.env.CHATBOT_MAX_HISTORY ?? "12");
  const maxOutputTokens = Number(
    process.env.CHATBOT_MAX_OUTPUT_TOKENS ?? "2500",
  );
  const safeMaxHistory =
    Number.isFinite(maxHistory) && maxHistory > 0 ? Math.floor(maxHistory) : 12;
  const safeMaxOutputTokens =
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : 2500;

  const safeMessages = messages
    .map(normalizeMessage)
    .filter((message) => message.content.length > 0)
    .slice(-safeMaxHistory);

  if (!safeMessages.length) {
    throw new Error("VALIDATION:At least one non-empty message is required.");
  }

  if (!apiKey) {
    throw new Error(
      "VALIDATION:OPENAI_API_KEY is not configured for chatbot responses.",
    );
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const capabilityContext = await resolveChatbotCapabilities(
    user,
    safeMessages,
  );
  const systemPrompt = capabilityContext.additionalSystemContext
    ? `${CHATBOT_SYSTEM_PROMPT}\n\n${capabilityContext.additionalSystemContext}`
    : CHATBOT_SYSTEM_PROMPT;

  return {
    model,
    safeMessages,
    systemPrompt,
    maxOutputTokens: safeMaxOutputTokens,
    capabilityContext: {
      capabilitiesUsed: capabilityContext.capabilitiesUsed,
      recommendedView: capabilityContext.recommendedView,
    },
    abortController,
    timeoutId,
  };
};

export const runChatbotQuery = async (
  messages: ChatMessageInput[],
  user: CurrentUser,
): Promise<{
  reply: string;
  model: string;
  capabilitiesUsed: ChatbotCapabilityName[];
  recommendedView: ChatbotRecommendedView;
}> => {
  const prepared = await prepareChatbotRequest(messages, user);

  try {
    const result = await generateText({
      model: openai(prepared.model),
      system: prepared.systemPrompt,
      messages: prepared.safeMessages,
      temperature: 0.3,
      maxOutputTokens: prepared.maxOutputTokens,
      abortSignal: prepared.abortController.signal,
    });

    const reply = result.text.trim();

    if (!reply) {
      throw new Error("DOWNSTREAM_FAILURE:No chatbot reply returned.");
    }

    return {
      reply,
      model: prepared.model,
      capabilitiesUsed: prepared.capabilityContext.capabilitiesUsed,
      recommendedView: prepared.capabilityContext.recommendedView,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("TIMEOUT:Chatbot request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(prepared.timeoutId);
  }
};

export const runChatbotQueryStream = async (
  messages: ChatMessageInput[],
  user: CurrentUser,
): Promise<{
  textStream: AsyncIterable<string>;
  model: string;
  capabilitiesUsed: ChatbotCapabilityName[];
  recommendedView: ChatbotRecommendedView;
  cleanup: () => void;
}> => {
  const prepared = await prepareChatbotRequest(messages, user);

  try {
    const result = streamText({
      model: openai(prepared.model),
      system: prepared.systemPrompt,
      messages: prepared.safeMessages,
      temperature: 0.3,
      maxOutputTokens: prepared.maxOutputTokens,
      abortSignal: prepared.abortController.signal,
    });

    return {
      textStream: result.textStream,
      model: prepared.model,
      capabilitiesUsed: prepared.capabilityContext.capabilitiesUsed,
      recommendedView: prepared.capabilityContext.recommendedView,
      cleanup: () => clearTimeout(prepared.timeoutId),
    };
  } catch (error) {
    clearTimeout(prepared.timeoutId);

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("TIMEOUT:Chatbot request timed out.");
    }

    throw error;
  }
};
