
import type { PoolClient } from "pg";
import { db } from "../../db";
import type { Role } from "../../middleware/team-access";

export interface MemberRow {
  user_id: number;
  name: string;
  email: string;
  role: Role;
  joined_at: Date;
}

export interface InvitationRow {
  id: number;
  team_id: number;
  email: string | null;
  token: string;
  role: Role;
  status: string;
  expires_at: Date;
  created_at: Date;
}

export interface InvitationDetailsRow extends InvitationRow {
  team_name: string;
  team_is_blocked: boolean;
  invited_by_name: string;
}


export async function createTeam(client: PoolClient, name: string, ownerId: number): Promise<number> {
  const team = await client.query<{ id: number }>("INSERT INTO teams (name) VALUES ($1) RETURNING id", [name]);
  const teamId = team.rows[0].id;
  await client.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')", [teamId, ownerId]);
  return teamId;
}

export async function deleteTeam(teamId: number): Promise<void> {
  await db.query("DELETE FROM teams WHERE id = $1", [teamId]);
}

export async function getTeamName(teamId: number): Promise<string | undefined> {
  const result = await db.query<{ name: string }>("SELECT name FROM teams WHERE id = $1", [teamId]);
  return result.rows[0]?.name;
}


export async function listMembers(teamId: number): Promise<MemberRow[]> {
  const result = await db.query<MemberRow>(
    `SELECT u.id AS user_id, u.name, u.email, m.role, m.joined_at
     FROM team_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY m.joined_at, u.name`,
    [teamId],
  );
  return result.rows;
}

export async function lockTeam(client: PoolClient, teamId: number): Promise<void> {
  await client.query("SELECT id FROM teams WHERE id = $1 FOR UPDATE", [teamId]);
}

export async function findMemberRole(client: PoolClient, teamId: number, userId: number): Promise<Role | undefined> {
  const result = await client.query<{ role: Role }>(
    "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, userId],
  );
  return result.rows[0]?.role;
}

export async function countOwners(client: PoolClient, teamId: number): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT count(*) FROM team_members WHERE team_id = $1 AND role = 'owner'",
    [teamId],
  );
  return Number(result.rows[0].count);
}

export async function updateMemberRole(client: PoolClient, teamId: number, userId: number, role: Role): Promise<void> {
  await client.query("UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3", [role, teamId, userId]);
}

export async function removeMember(client: PoolClient, teamId: number, userId: number): Promise<void> {
  await client.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId]);
}

export async function addMember(client: PoolClient, teamId: number, userId: number, role: Role): Promise<void> {
  await client.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)", [teamId, userId, role]);
}


export async function createInvitation(
  teamId: number, invitedBy: number, email: string | null, token: string, role: Role, expiresAt: Date,
): Promise<InvitationRow> {
  const result = await db.query<InvitationRow>(
    `INSERT INTO invitations (team_id, invited_by, email, token, role, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [teamId, invitedBy, email, token, role, expiresAt],
  );
  return result.rows[0];
}

export async function isEmailMember(teamId: number, email: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM team_members m JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND u.email = $2`,
    [teamId, email],
  );
  return result.rows.length > 0;
}

export async function hasPendingInvitation(teamId: number, email: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM invitations
     WHERE team_id = $1 AND email = $2 AND status = 'pending' AND expires_at > now()`,
    [teamId, email],
  );
  return result.rows.length > 0;
}

export async function listTeamInvitations(teamId: number): Promise<InvitationRow[]> {
  const result = await db.query<InvitationRow>(
    `SELECT * FROM invitations
     WHERE team_id = $1 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at DESC`,
    [teamId],
  );
  return result.rows;
}

export async function deletePendingInvitation(teamId: number, invitationId: number): Promise<boolean> {
  const result = await db.query(
    "DELETE FROM invitations WHERE id = $1 AND team_id = $2 AND status = 'pending'",
    [invitationId, teamId],
  );
  return result.rowCount === 1;
}

const INVITATION_DETAILS = `
  SELECT i.*, t.name AS team_name, t.is_blocked AS team_is_blocked, u.name AS invited_by_name
  FROM invitations i
  JOIN teams t ON t.id = i.team_id
  JOIN users u ON u.id = i.invited_by`;

export async function findInvitationByToken(token: string): Promise<InvitationDetailsRow | undefined> {
  const result = await db.query<InvitationDetailsRow>(`${INVITATION_DETAILS} WHERE i.token = $1`, [token]);
  return result.rows[0];
}

export async function lockInvitationByToken(client: PoolClient, token: string): Promise<InvitationDetailsRow | undefined> {
  const result = await client.query<InvitationDetailsRow>(`${INVITATION_DETAILS} WHERE i.token = $1 FOR UPDATE OF i`, [token]);
  return result.rows[0];
}

export async function setInvitationStatus(client: PoolClient, invitationId: number, status: "accepted" | "declined"): Promise<void> {
  await client.query("UPDATE invitations SET status = $1 WHERE id = $2", [status, invitationId]);
}

export async function listInvitationsForEmail(email: string): Promise<InvitationDetailsRow[]> {
  const result = await db.query<InvitationDetailsRow>(
    `${INVITATION_DETAILS}
     WHERE i.email = $1 AND i.status = 'pending' AND i.expires_at > now() AND t.is_blocked = false
     ORDER BY i.created_at DESC`,
    [email],
  );
  return result.rows;
}


export async function logTeamAction(
  userId: number, teamId: number, action: "create" | "update" | "delete" | "invite", details: string,
): Promise<void> {
  await db.query(
    "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, $3, $4)",
    [userId, teamId, action, details],
  );
}
