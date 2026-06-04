import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

export const authorizeApiKey = async (req: Request) => {
  let result = {
    success: false,
    message:
      "You're not authorized to access this data. Please contact your administrator for an Access Token.",
  };

  const requestApiKey = req.headers.get("Authorization");
  const apiKey = process.env.API_KEY;

  if (apiKey && requestApiKey && safeCompare(apiKey, requestApiKey)) {
    result = {
      success: true,
      message: "Authorized",
    };
  }

  return result;
};

export function stripSpecialCharacters(input: string): string {
  return input.replace(/[^a-zA-Z0-9-.]/g, "");
}

export function convertToInt(value?: string | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  } else if (isNaN(Number(stripSpecialCharacters(value)))) {
    return value;
  } else {
    return parseFloat(stripSpecialCharacters(value));
  }
}
