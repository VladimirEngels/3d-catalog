
import type { NextFunction, Request, Response } from "express";
import { log } from "../logger";

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    const address = req.originalUrl.split("?")[0];
    const who = res.locals.user ? res.locals.user.email : "не вошёл";
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";

    log(level, `${req.method} ${address} → ${res.statusCode}, ${duration} мс, пользователь: ${who}`);
  });

  next();
}
