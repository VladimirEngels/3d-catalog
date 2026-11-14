
import { AppError } from "../../errors";

export function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeEmail(value: unknown): string {
  return readText(value).trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.length <= 255;
}

export function readId(value: unknown): number {
  const text = String(value);
  const id = Number(text);
  if (!/^\d+$/.test(text) || id < 1 || id > 2147483647) {
    throw new AppError(404, "Запись не найдена");
  }
  return id;
}
