
import { db } from "../../db";

export interface ModelRow {
  id: number;
  name: string;
  description: string | null;
  author_id: number;
  author_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface VersionRow {
  id: number;
  version_number: number;
  comment: string | null;
  triangles_count: number;
  vertices_count: number;
  has_skeleton: boolean;
  size_x: number;
  size_y: number;
  size_z: number;
  preview_path: string | null;
  created_at: Date;
  size_bytes: string;
}

export interface FileRow {
  id: number;
  file_name: string;
  format: string;
  size_bytes: string;
  version_id: number | null;
  job_id: number | null;
  storage_path: string;
  created_at: Date;
}

export interface TextureRow {
  id: number;
  file_name: string;
  width: number;
  height: number;
  size_bytes: string;
  storage_path: string;
  source_texture_id: number | null;
}

export async function findModel(teamId: number, modelId: number): Promise<ModelRow | undefined> {
  const result = await db.query<ModelRow>(
    `SELECT m.id, m.name, m.description, m.author_id, u.name AS author_name, m.created_at, m.updated_at
     FROM models m
     JOIN users u ON u.id = m.author_id
     WHERE m.id = $1 AND m.team_id = $2`,
    [modelId, teamId],
  );
  return result.rows[0];
}

export async function listVersions(modelId: number): Promise<VersionRow[]> {
  const result = await db.query<VersionRow>(
    `SELECT v.*, (SELECT COALESCE(sum(f.size_bytes), 0) FROM files f WHERE f.version_id = v.id) AS size_bytes
     FROM model_versions v
     WHERE v.model_id = $1
     ORDER BY v.version_number DESC`,
    [modelId],
  );
  return result.rows;
}

export async function listTags(modelId: number): Promise<{ name: string; is_auto: boolean }[]> {
  const result = await db.query<{ name: string; is_auto: boolean }>(
    `SELECT t.name, mt.is_auto
     FROM model_tags mt
     JOIN tags t ON t.id = mt.tag_id
     WHERE mt.model_id = $1
     ORDER BY mt.is_auto DESC, t.name`,
    [modelId],
  );
  return result.rows;
}

export async function listModelCollections(modelId: number): Promise<{ id: number; name: string }[]> {
  const result = await db.query<{ id: number; name: string }>(
    `SELECT c.id, c.name
     FROM collection_models cm
     JOIN collections c ON c.id = cm.collection_id
     WHERE cm.model_id = $1
     ORDER BY c.name`,
    [modelId],
  );
  return result.rows;
}

export async function listMaterials(versionId: number): Promise<string[]> {
  const result = await db.query<{ name: string }>("SELECT name FROM materials WHERE version_id = $1 ORDER BY id", [versionId]);
  return result.rows.map((row) => row.name);
}

export async function listAllVersionFiles(versionId: number): Promise<FileRow[]> {
  const result = await db.query<FileRow>(
    `SELECT f.*
     FROM files f
     LEFT JOIN conversion_jobs j ON j.id = f.job_id
     WHERE f.version_id = $1 OR j.version_id = $1
     ORDER BY f.job_id NULLS FIRST, f.id`,
    [versionId],
  );
  return result.rows;
}

export async function listAllVersionTextures(versionId: number): Promise<TextureRow[]> {
  const result = await db.query<TextureRow>(
    `SELECT tx.id, tx.file_name, tx.width, tx.height, tx.size_bytes, tx.storage_path, tx.source_texture_id
     FROM textures tx
     LEFT JOIN textures source ON source.id = tx.source_texture_id
     WHERE tx.version_id = $1 OR source.version_id = $1
     ORDER BY tx.id`,
    [versionId],
  );
  return result.rows;
}

export async function findVersion(teamId: number, modelId: number, versionId: number): Promise<{ id: number; version_number: number; model_name: string } | undefined> {
  const result = await db.query<{ id: number; version_number: number; model_name: string }>(
    `SELECT v.id, v.version_number, m.name AS model_name
     FROM model_versions v
     JOIN models m ON m.id = v.model_id
     WHERE v.id = $1 AND m.id = $2 AND m.team_id = $3`,
    [versionId, modelId, teamId],
  );
  return result.rows[0];
}

export async function updateDescription(modelId: number, description: string | null): Promise<void> {
  await db.query("UPDATE models SET description = $1, updated_at = now() WHERE id = $2", [description, modelId]);
}

export async function replaceManualTags(teamId: number, modelId: number, tags: string[]): Promise<void> {
  await db.query("DELETE FROM model_tags WHERE model_id = $1 AND is_auto = false", [modelId]);
  for (const name of tags) {
    const tag = await db.query<{ id: number }>(
      `INSERT INTO tags (team_id, name) VALUES ($1, $2)
       ON CONFLICT (team_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [teamId, name],
    );
    await db.query(
      "INSERT INTO model_tags (model_id, tag_id, is_auto) VALUES ($1, $2, false) ON CONFLICT (model_id, tag_id) DO NOTHING",
      [modelId, tag.rows[0].id],
    );
  }
}

export async function listModelStoragePaths(modelId: number): Promise<string[]> {
  const result = await db.query<{ storage_path: string }>(
    `SELECT f.storage_path
     FROM files f
     LEFT JOIN conversion_jobs j ON j.id = f.job_id
     JOIN model_versions v ON v.id = COALESCE(f.version_id, j.version_id)
     WHERE v.model_id = $1`,
    [modelId],
  );
  return result.rows.map((row) => row.storage_path);
}

export async function deleteModel(modelId: number): Promise<void> {
  await db.query("DELETE FROM models WHERE id = $1", [modelId]);
}

export async function logModelAction(userId: number, teamId: number, action: "update" | "delete" | "download", details: string): Promise<void> {
  await db.query(
    "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, $3, $4)",
    [userId, teamId, action, details],
  );
}
