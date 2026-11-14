
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";
import { findUserBySession, type UserRow } from "../modules/accounts/repository";
import { hashToken } from "../modules/accounts/service";

export const SESSION_COOKIE = "session";

declare global {
  namespace Express {
    interface Locals {
      user: UserRow;
    }
  }
}

export function requireSystemAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.user.is_system_admin) {
    throw new AppError(403, "Этот раздел доступен только администратору системы");
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies[SESSION_COOKIE];
  if (typeof token !== "string") {
    throw new AppError(401, "Нужно войти в систему");
  }

  const user = await findUserBySession(hashToken(token));
  if (!user) {
    throw new AppError(401, "Нужно войти в систему");
  }

  res.locals.user = user;
  next();
}
