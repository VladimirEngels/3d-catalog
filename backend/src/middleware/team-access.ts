
import type { NextFunction, Request, Response } from "express";
import { db } from "../db";
import { AppError } from "../errors";
import { readId } from "../modules/accounts/validation";

export type Role = "viewer" | "member" | "owner";

const roleRank: Record<Role, number> = { viewer: 1, member: 2, owner: 3 };

declare global {
  namespace Express {
    interface Locals {
      team: { id: number; role: Role };
    }
  }
}

export function requireTeamRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const teamId = readId(req.params.teamId);

    const result = await db.query<{ role: Role; is_blocked: boolean }>(
      `SELECT m.role, t.is_blocked
       FROM team_members m
       JOIN teams t ON t.id = m.team_id
       WHERE m.team_id = $1 AND m.user_id = $2`,
      [teamId, res.locals.user.id],
    );
    const membership = result.rows[0];

    if (!membership) {
      throw new AppError(404, "Команда не найдена");
    }
    if (membership.is_blocked) {
      throw new AppError(403, "Команда заблокирована администратором");
    }
    if (roleRank[membership.role] < roleRank[minRole]) {
      throw new AppError(403, "Для этого действия не хватает прав");
    }

    res.locals.team = { id: teamId, role: membership.role };
    next();
  };
}
