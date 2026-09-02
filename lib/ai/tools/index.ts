import type { CurrentUser } from "@/lib/user.service";
import { createPrismNativeTools } from "./prism-native";
import { createPowerBiTools } from "./power-bi";
import { DEFAULT_AI_PRIMARY_SOURCE, type AiPrimarySource } from "../source-setting";

export const createAiTools = (
  user: CurrentUser,
  abortSignal?: AbortSignal,
  sessionId?: number,
  primary: AiPrimarySource = DEFAULT_AI_PRIMARY_SOURCE,
) => {
  return {
    ...createPrismNativeTools(user, abortSignal, sessionId, primary),
    ...createPowerBiTools(user, abortSignal, sessionId, primary),
  };
};

export type AiTools = ReturnType<typeof createAiTools>;
