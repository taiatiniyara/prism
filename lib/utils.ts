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
