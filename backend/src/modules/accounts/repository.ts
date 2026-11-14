
import { db } from "../../db";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  is_system_admin: boolean;
  is_blocked: boolean;
}

export interface MembershipRow {
  team_id: number;
  team_name: string;
  role: "viewer" | "member" | "owner";
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
}

export async function findUserById(id: number): Promise<UserRow | undefined> {
  const result = await db.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

export async function createUser(email: string, passwordHash: string, name: string): Promise<UserRow> {
  const result = await db.query<UserRow>(
    "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *",
    [email, passwordHash, name],
  );
  return result.rows[0];
}

export async function updatePasswordHash(userId: number, passwordHash: string): Promise<void> {
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

export async function findMemberships(userId: number): Promise<MembershipRow[]> {
  const result = await db.query<MembershipRow>(
    `SELECT t.id AS team_id, t.name AS team_name, m.role
     FROM team_members m
     JOIN teams t ON t.id = m.team_id
     WHERE m.user_id = $1 AND t.is_blocked = false
     ORDER BY t.name`,
    [userId],
  );
  return result.rows;
}

export async function countInvitations(email: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*)
     FROM invitations i
     JOIN teams t ON t.id = i.team_id
     WHERE i.email = $1 AND i.status = 'pending' AND i.expires_at > now() AND t.is_blocked = false`,
    [email],
  );
  return Number(result.rows[0].count);
}

export async function createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt],
  );
}

export async function findUserBySession(tokenHash: string): Promise<UserRow | undefined> {
  const result = await db.query<UserRow>(
    `SELECT u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_blocked = false`,
    [tokenHash],
  );
  return result.rows[0];
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteAllSessions(userId: number): Promise<void> {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.query("DELETE FROM sessions WHERE expires_at <= now()");
}

export async function logLogin(userId: number): Promise<void> {
  await db.query("INSERT INTO action_log (user_id, action) VALUES ($1, 'login')", [userId]);
}
