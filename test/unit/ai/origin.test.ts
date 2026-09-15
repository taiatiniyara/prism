import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isValidOrigin } from "@/lib/ai/origin";

const APP_URL = "https://dev.prismdashboard.org";

const requestWith = (headers: Record<string, string>): Request =>
  new Request("https://dev.prismdashboard.org/api/ai/chat", { method: "POST", headers });

describe("isValidOrigin", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("accepts a matching origin", () => {
    expect(isValidOrigin(requestWith({ origin: APP_URL }))).toBe(true);
  });

  it("accepts a matching referer when origin is absent", () => {
    expect(isValidOrigin(requestWith({ referer: `${APP_URL}/dashboard` }))).toBe(true);
  });

  it("rejects a suffix-spoofed origin", () => {
    expect(isValidOrigin(requestWith({ origin: `${APP_URL}.evil.com` }))).toBe(false);
  });

  it("rejects a suffix-spoofed referer", () => {
    expect(isValidOrigin(requestWith({ referer: `${APP_URL}.evil.com/dashboard` }))).toBe(false);
  });

  it("rejects a different host entirely", () => {
    expect(isValidOrigin(requestWith({ origin: "https://evil.com" }))).toBe(false);
  });

  it("rejects when both headers are absent", () => {
    expect(isValidOrigin(requestWith({}))).toBe(false);
  });

  it("rejects a malformed origin header", () => {
    expect(isValidOrigin(requestWith({ origin: "not-a-url" }))).toBe(false);
  });
});
