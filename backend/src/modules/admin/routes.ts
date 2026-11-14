
import { Router, type Request } from "express";
import { AppError } from "../../errors";
import { log } from "../../logger";
import { requireAuth, requireSystemAdmin } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId, readText } from "../accounts/validation";
import * as repository from "./repository";

export const adminRouter = Router();

const PAGE_SIZE = 50;
const LOG_ACTIONS = ["login", "create", "update", "delete", "download", "convert", "invite"];
const ALLOWED_PERIODS = [14, 30, 90];
const DEFAULT_PERIOD = 14;

function readPage(req: Request): number {
  const text = readText(req.query.page);
  return /^\d{1,6}$/.test(text) ? Number(text) : 0;
}

function readPeriod(req: Request): number {
  const days = Number(req.query.days);
  return ALLOWED_PERIODS.includes(days) ? days : DEFAULT_PERIOD;
}

function readStatus(req: Request): string {
  const status = readText(req.query.status);
  return status === "active" || status === "blocked" ? status : "";
}

function readSmallNumber(value: unknown): number | null {
  const text = readText(value);
  return /^\d{1,9}$/.test(text) ? Number(text) : null;
}


adminRouter.get("/teams/:teamId/log", requireAuth, requireTeamRole("owner"), async (req, res) => {
  const action = readText(req.query.action);
  const page = readPage(req);
  const rows = await repository.listTeamLog(res.locals.team.id, {
    userId: readSmallNumber(req.query.user),
    action: LOG_ACTIONS.includes(action) ? action : null,
    days: readSmallNumber(req.query.days),
    query: readText(req.query.q).trim().slice(0, 200),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      details: row.details,
      userName: row.user_name,
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    page,
    pageSize: PAGE_SIZE,
    authors: await repository.listLogAuthors(res.locals.team.id),
  });
});

adminRouter.get("/teams/:teamId/summary", requireAuth, requireTeamRole("owner"), async (req, res) => {
  res.json(await repository.getTeamSummary(res.locals.team.id, readPeriod(req)));
});


adminRouter.get("/admin/stats", requireAuth, requireSystemAdmin, async (req, res) => {
  res.json(await repository.getSystemStats(readPeriod(req)));
});

adminRouter.get("/admin/users", requireAuth, requireSystemAdmin, async (req, res) => {
  const page = readPage(req);
  const rows = await repository.listUsers(readText(req.query.q).trim().slice(0, 200), readStatus(req), PAGE_SIZE, page * PAGE_SIZE);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      isAdmin: row.is_system_admin,
      isBlocked: row.is_blocked,
      createdAt: row.created_at,
      teamCount: Number(row.team_count),
      lastLogin: row.last_login,
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    page,
    pageSize: PAGE_SIZE,
  });
});

adminRouter.get("/admin/teams", requireAuth, requireSystemAdmin, async (req, res) => {
  const page = readPage(req);
  const rows = await repository.listTeams(readText(req.query.q).trim().slice(0, 200), readStatus(req), PAGE_SIZE, page * PAGE_SIZE);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      isBlocked: row.is_blocked,
      createdAt: row.created_at,
      ownerEmails: row.owner_emails,
      memberCount: Number(row.member_count),
      modelCount: Number(row.model_count),
      diskBytes: Number(row.disk_bytes),
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    page,
    pageSize: PAGE_SIZE,
  });
});

function readBlocked(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new AppError(400, "Неверное значение блокировки");
  }
  return value;
}

adminRouter.patch("/admin/users/:userId", requireAuth, requireSystemAdmin, async (req, res) => {
  const userId = readId(req.params.userId);
  const blocked = readBlocked(req.body?.blocked);
  if (userId === res.locals.user.id) {
    throw new AppError(400, "Нельзя заблокировать самого себя");
  }
  if (!(await repository.setUserBlocked(userId, blocked))) {
    throw new AppError(404, "Пользователь не найден");
  }
  log("INFO", `Пользователь ${userId}: ${blocked ? "заблокирован" : "разблокирован"}, администратор ${res.locals.user.email}`);
  res.status(204).end();
});

adminRouter.patch("/admin/teams/:teamId", requireAuth, requireSystemAdmin, async (req, res) => {
  const teamId = readId(req.params.teamId);
  const blocked = readBlocked(req.body?.blocked);
  if (!(await repository.setTeamBlocked(teamId, blocked))) {
    throw new AppError(404, "Команда не найдена");
  }
  log("INFO", `Команда ${teamId}: ${blocked ? "заблокирована" : "разблокирована"}, администратор ${res.locals.user.email}`);
  res.status(204).end();
});
