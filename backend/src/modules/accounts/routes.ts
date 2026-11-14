
import { Router, type Response } from "express";
import { requireAuth, SESSION_COOKIE } from "../../middleware/auth";
import { findUserBySession } from "./repository";
import * as service from "./service";

export const accountsRouter = Router();

const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: service.SESSION_LIFETIME_MS });
}

async function sendMe(res: Response, token: string, status: number): Promise<void> {
  const user = await findUserBySession(service.hashToken(token));
  res.status(status).json(await service.getMe(user!));
}

accountsRouter.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  const token = await service.register(email, password, name);
  setSessionCookie(res, token);
  await sendMe(res, token, 201);
});

accountsRouter.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const token = await service.login(email, password);
  setSessionCookie(res, token);
  await sendMe(res, token, 200);
});

accountsRouter.post("/auth/logout", async (req, res) => {
  const token: unknown = req.cookies[SESSION_COOKIE];
  if (typeof token === "string") {
    await service.logout(token);
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});

accountsRouter.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const token = await service.changePassword(res.locals.user.id, currentPassword, newPassword);
  setSessionCookie(res, token);
  res.status(204).end();
});

accountsRouter.get("/me", requireAuth, async (_req, res) => {
  res.json(await service.getMe(res.locals.user));
});
