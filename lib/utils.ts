import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createUUID() {
  const uuid = crypto.randomUUID();
  return uuid;
}

export function generateRandomNumber(length: number) {
  const random = Math.floor(Math.random() * Math.pow(10, length));
  return random;
}

interface KeyTypePair {
  column: string;
  type: string;
}

/**
 * Destructures an object and returns an array of its keys and their data types.
 * @param obj - The source object to inspect.
 * @returns An array of KeyTypePair objects.
 */
export function listColumnsAndTypes(obj: Record<string, unknown>): KeyTypePair[] {
  // Using Object.entries() to destructure the object into [key, value] pairs
  return Object.entries(obj).map(([column, value]) => {
    // Handle the JavaScript 'null' quirk (typeof null is 'object')
    const actualType = value === null ? "null" : typeof value;

    return {
      column,
      type: actualType,
    };
  });
}
