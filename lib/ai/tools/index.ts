import type { CurrentUser } from "@/lib/user.service";
import { createPrismNativeTools } from "./prism-native";
import { createPowerBiTools } from "./power-bi";

export const createAiTools = (user: CurrentUser, abortSignal?: AbortSignal, sessionId?: number) => {
  return {
    ...createPrismNativeTools(user, abortSignal, sessionId),
    ...createPowerBiTools(user, abortSignal, sessionId),
  };
};

export type AiTools = ReturnType<typeof createAiTools>;
