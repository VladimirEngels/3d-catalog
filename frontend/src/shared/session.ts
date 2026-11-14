
import { request } from "./api/http";
import type { Me, Role, TeamMembership, User } from "./api/types";

export type Action =
  | "view"
  | "upload"
  | "convert"
  | "editOwn"
  | "collections"
  | "manageTeam"
  | "viewLog";

const minRole: Record<Action, Role> = {
  view: "viewer",
  upload: "member",
  convert: "member",
  editOwn: "member",
  collections: "member",
  manageTeam: "owner",
  viewLog: "owner",
};

const roleRank: Record<Role, number> = { viewer: 1, member: 2, owner: 3 };

export const roleName: Record<Role, string> = { viewer: "Наблюдатель", member: "Участник", owner: "Владелец" };

export interface Session {
  user: User;
  teams: TeamMembership[];
  team: TeamMembership | null;
  invitationCount: number;
}

const TEAM_KEY = "currentTeamId";

let savedSession: Session | null = null;

export async function getSession(): Promise<Session> {
  if (savedSession !== null) {
    return savedSession;
  }

  const me = await request<Me>("GET", "/me");

  const savedTeamId = Number(localStorage.getItem(TEAM_KEY));
  const savedTeam = me.teams.find((team) => team.teamId === savedTeamId);
  const firstTeam = me.teams.length > 0 ? me.teams[0] : null;

  savedSession = { user: me.user, teams: me.teams, team: savedTeam ?? firstTeam, invitationCount: me.invitationCount };
  return savedSession;
}

export function can(session: Session, action: Action): boolean {
  if (session.team === null) {
    return false;
  }
  return roleRank[session.team.role] >= roleRank[minRole[action]];
}

export function rememberTeam(teamId: number): void {
  localStorage.setItem(TEAM_KEY, String(teamId));
}

export function switchTeam(teamId: number): void {
  rememberTeam(teamId);
  location.href = "/pages/catalog.html";
}
