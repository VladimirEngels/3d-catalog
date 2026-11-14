
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const LOG_DIR = resolve(import.meta.dirname, "../logs");
const IS_TEST_RUN = process.env.NODE_TEST_CONTEXT !== undefined;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function log(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const now = new Date();
  const date = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  const time = `${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}:${twoDigits(now.getSeconds())}`;
  const line = `${date} ${time} ${level.padEnd(5)} ${message}`;

  console.log(line);

  if (IS_TEST_RUN) {
    return;
  }
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(resolve(LOG_DIR, `${date}.log`), line + "\n");
  } catch (error) {
    console.error("Не удалось записать журнал в файл:", error);
  }
}
