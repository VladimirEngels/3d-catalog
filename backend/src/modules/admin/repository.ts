
import { db } from "../../db";


export interface LogFilters {
  userId: number | null;
  action: string | null;
  days: number | null;
  query: string;
  limit: number;
  offset: number;
}

export interface LogRow {
  id: number;
  created_at: Date;
  action: string;
  details: string | null;
  user_name: string;
  total: string;
}

export async function listTeamLog(teamId: number, filters: LogFilters): Promise<LogRow[]> {
  const params: unknown[] = [teamId];
  const conditions = [
    `(l.team_id = $1 OR (l.team_id IS NULL AND l.action = 'login' AND EXISTS (
        SELECT 1 FROM team_members m
        WHERE m.team_id = $1 AND m.user_id = l.user_id AND m.joined_at <= l.created_at)))`,
  ];

  function param(value: unknown): string {
    params.push(value);
    return `$${params.length}`;
  }

  if (filters.userId !== null) {
    conditions.push(`l.user_id = ${param(filters.userId)}`);
  }
  if (filters.action !== null) {
    conditions.push(`l.action = ${param(filters.action)}`);
  }
  if (filters.days !== null) {
    conditions.push(`l.created_at >= now() - ${param(filters.days)} * interval '1 day'`);
  }
  if (filters.query !== "") {
    const escaped = filters.query.replace(/[\\%_]/g, "\\$&");
    conditions.push(`l.details ILIKE ${param(`%${escaped}%`)}`);
  }

  const result = await db.query<LogRow>(
    `SELECT l.id, l.created_at, l.action, l.details, u.name AS user_name, count(*) OVER () AS total
     FROM action_log l
     JOIN users u ON u.id = l.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ${param(filters.limit)} OFFSET ${param(filters.offset)}`,
    params,
  );
  return result.rows;
}

export async function listLogAuthors(teamId: number): Promise<{ id: number; name: string }[]> {
  const result = await db.query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
     FROM users u
     WHERE u.id IN (SELECT user_id FROM team_members WHERE team_id = $1)
        OR u.id IN (SELECT user_id FROM action_log WHERE team_id = $1)
     ORDER BY u.name`,
    [teamId],
  );
  return result.rows;
}


export interface DayCount {
  day: string;
  count: number;
}

async function countJobsByDay(teamId: number | null, days: number): Promise<DayCount[]> {
  const result = await db.query<{ day: string; count: string }>(
    `SELECT to_char(d, 'DD.MM') AS day, count(j.id) AS count
     FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') d
     LEFT JOIN (
       SELECT j.id, j.created_at
       FROM conversion_jobs j
       JOIN model_versions v ON v.id = j.version_id
       JOIN models m ON m.id = v.model_id
       WHERE $1::int IS NULL OR m.team_id = $1
     ) j ON j.created_at >= d AND j.created_at < d + interval '1 day'
     GROUP BY d
     ORDER BY d`,
    [teamId, days],
  );
  return result.rows.map((row) => ({ day: row.day, count: Number(row.count) }));
}

export async function getTeamSummary(teamId: number, days: number) {
  const totals = await db.query<{ models: string; members: string; new_models: string; new_members: string }>(
    `SELECT (SELECT count(*) FROM models WHERE team_id = $1) AS models,
            (SELECT count(*) FROM team_members WHERE team_id = $1) AS members,
            (SELECT count(*) FROM models WHERE team_id = $1 AND created_at >= now() - $2::int * interval '1 day') AS new_models,
            (SELECT count(*) FROM team_members WHERE team_id = $1 AND joined_at >= now() - $2::int * interval '1 day') AS new_members`,
    [teamId, days],
  );

  const teamJobs = `
    FROM conversion_jobs j
    JOIN model_versions v ON v.id = j.version_id
    JOIN models m ON m.id = v.model_id
    WHERE m.team_id = $1 AND j.created_at >= now() - $2::int * interval '1 day'`;

  const jobs = await db.query<{ total: string; failed: string }>(
    `SELECT count(*) AS total, count(*) FILTER (WHERE j.status = 'failed') AS failed ${teamJobs}`,
    [teamId, days],
  );
  const reasons = await db.query<{ reason: string; count: string }>(
    `SELECT j.error_message AS reason, count(*) AS count
     ${teamJobs} AND j.status = 'failed'
     GROUP BY j.error_message
     ORDER BY count(*) DESC, j.error_message
     LIMIT 8`,
    [teamId, days],
  );
  const formats = await db.query<{ format: string; count: string }>(
    `SELECT j.target_format AS format, count(*) AS count
     ${teamJobs}
     GROUP BY j.target_format
     ORDER BY count(*) DESC, j.target_format`,
    [teamId, days],
  );
  const largest = await db.query<{ id: number; name: string; author_name: string; triangles_count: number; size_bytes: string }>(
    `SELECT m.id, m.name, u.name AS author_name, v.triangles_count,
            (SELECT COALESCE(sum(f.size_bytes), 0) FROM files f WHERE f.version_id = v.id) AS size_bytes
     FROM models m
     JOIN users u ON u.id = m.author_id
     JOIN LATERAL (
       SELECT * FROM model_versions WHERE model_id = m.id ORDER BY version_number DESC LIMIT 1
     ) v ON true
     WHERE m.team_id = $1
     ORDER BY size_bytes DESC, m.id
     LIMIT 5`,
    [teamId],
  );

  return {
    models: Number(totals.rows[0].models),
    members: Number(totals.rows[0].members),
    newModels: Number(totals.rows[0].new_models),
    newMembers: Number(totals.rows[0].new_members),
    jobs: Number(jobs.rows[0].total),
    failedJobs: Number(jobs.rows[0].failed),
    jobsByDay: await countJobsByDay(teamId, days),
    errorReasons: reasons.rows.map((row) => ({ reason: row.reason, count: Number(row.count) })),
    formats: formats.rows.map((row) => ({ format: row.format, count: Number(row.count) })),
    largestModels: largest.rows.map((row) => ({
      id: row.id,
      name: row.name,
      authorName: row.author_name,
      triangles: row.triangles_count,
      sizeBytes: Number(row.size_bytes),
    })),
  };
}


export async function getSystemStats(days: number) {
  const result = await db.query<{
    users: string; new_users: string; teams: string; new_teams: string; disk_bytes: string; jobs: string; failed_jobs: string;
  }>(
    `SELECT (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM users WHERE created_at >= now() - $1::int * interval '1 day') AS new_users,
            (SELECT count(*) FROM teams) AS teams,
            (SELECT count(*) FROM teams WHERE created_at >= now() - $1::int * interval '1 day') AS new_teams,
            (SELECT COALESCE(sum(size_bytes), 0) FROM files) + (SELECT COALESCE(sum(size_bytes), 0) FROM textures) AS disk_bytes,
            (SELECT count(*) FROM conversion_jobs WHERE created_at >= now() - $1::int * interval '1 day') AS jobs,
            (SELECT count(*) FROM conversion_jobs WHERE status = 'failed' AND created_at >= now() - $1::int * interval '1 day') AS failed_jobs`,
    [days],
  );
  const row = result.rows[0];
  return {
    users: Number(row.users),
    newUsers: Number(row.new_users),
    teams: Number(row.teams),
    newTeams: Number(row.new_teams),
    diskBytes: Number(row.disk_bytes),
    jobs: Number(row.jobs),
    failedJobs: Number(row.failed_jobs),
    jobsByDay: await countJobsByDay(null, days),
  };
}


function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function listUsers(query: string, status: string, limit: number, offset: number) {
  const result = await db.query<{
    id: number; name: string; email: string; is_system_admin: boolean; is_blocked: boolean;
    created_at: Date; team_count: string; last_login: Date | null; total: string;
  }>(
    `SELECT u.id, u.name, u.email, u.is_system_admin, u.is_blocked, u.created_at,
            (SELECT count(*) FROM team_members m WHERE m.user_id = u.id) AS team_count,
            (SELECT max(l.created_at) FROM action_log l WHERE l.user_id = u.id AND l.action = 'login') AS last_login,
            count(*) OVER () AS total
     FROM users u
     WHERE (u.name ILIKE $1 OR u.email ILIKE $1)
       AND ($2 = '' OR ($2 = 'blocked' AND u.is_blocked) OR ($2 = 'active' AND NOT u.is_blocked))
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $3 OFFSET $4`,
    [likePattern(query), status, limit, offset],
  );
  return result.rows;
}

export async function listTeams(query: string, status: string, limit: number, offset: number) {
  const result = await db.query<{
    id: number; name: string; is_blocked: boolean; created_at: Date; owner_emails: string[];
    member_count: string; model_count: string; disk_bytes: string; total: string;
  }>(
    `SELECT t.id, t.name, t.is_blocked, t.created_at,
            ARRAY(
              SELECT u.email FROM team_members m JOIN users u ON u.id = m.user_id
              WHERE m.team_id = t.id AND m.role = 'owner' ORDER BY u.email
            ) AS owner_emails,
            (SELECT count(*) FROM team_members m WHERE m.team_id = t.id) AS member_count,
            (SELECT count(*) FROM models m WHERE m.team_id = t.id) AS model_count,
            (SELECT COALESCE(sum(f.size_bytes), 0)
             FROM files f
             LEFT JOIN conversion_jobs j ON j.id = f.job_id
             JOIN model_versions v ON v.id = COALESCE(f.version_id, j.version_id)
             JOIN models m ON m.id = v.model_id
             WHERE m.team_id = t.id)
            + (SELECT COALESCE(sum(x.size_bytes), 0)
               FROM textures x
               LEFT JOIN textures source ON source.id = x.source_texture_id
               JOIN model_versions v ON v.id = COALESCE(x.version_id, source.version_id)
               JOIN models m ON m.id = v.model_id
               WHERE m.team_id = t.id) AS disk_bytes,
            count(*) OVER () AS total
     FROM teams t
     WHERE (t.name ILIKE $1 OR EXISTS (
              SELECT 1 FROM team_members m JOIN users u ON u.id = m.user_id
              WHERE m.team_id = t.id AND m.role = 'owner' AND u.email ILIKE $1))
       AND ($2 = '' OR ($2 = 'blocked' AND t.is_blocked) OR ($2 = 'active' AND NOT t.is_blocked))
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $3 OFFSET $4`,
    [likePattern(query), status, limit, offset],
  );
  return result.rows;
}

export async function setUserBlocked(userId: number, blocked: boolean): Promise<boolean> {
  const result = await db.query("UPDATE users SET is_blocked = $1 WHERE id = $2", [blocked, userId]);
  if (blocked) {
    await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  }
  return result.rowCount === 1;
}

export async function setTeamBlocked(teamId: number, blocked: boolean): Promise<boolean> {
  const result = await db.query("UPDATE teams SET is_blocked = $1 WHERE id = $2", [blocked, teamId]);
  return result.rowCount === 1;
}
