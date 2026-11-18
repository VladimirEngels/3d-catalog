import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { normalizeEmail } from "../../validation";

const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { expires: number; count: number; emails: Map<string, number> }>();

setInterval(() => {
  for (const [ip, entry] of attempts) {
    if (entry.expires <= Date.now()) attempts.delete(ip);
  }
}, 60 * 1000).unref();


export function limitLogin(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  let entry = attempts.get(ip);
  if (!entry || entry.expires <= now) {
    entry = { expires: now + WINDOW_MS, count: 0, emails: new Map() };
    attempts.set(ip, entry);
  }
  const email = createHash("sha256").update(normalizeEmail(req.body?.email)).digest("hex");
  const count = entry.emails.get(email) ?? 0;
  entry.count++;
  if (entry.count > 30 || count >= 10) {
    const retryAfter = Math.ceil((entry.expires - now) / 1000);
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: `Слишком много попыток входа. Повторите через ${retryAfter} сек.`,
      retryAfter,
    });
    return;
  }
  entry.emails.set(email, count + 1);
  next();
}
