
import type { PoolClient } from "pg";
import { db } from "../../db";

export interface DuplicateRow {
  id: number;
  name: string;
  author_name: string;
  created_at: Date;
  format: string;
  triangles_count: number;
  has_preview: boolean;
}

export async function findDuplicate(client: PoolClient | typeof db, teamId: number, checksum: string): Promise<DuplicateRow | undefined> {
  const result = await client.query<DuplicateRow>(
    `SELECT m.id, m.name, u.name AS author_name, m.created_at, f.format, v.triangles_count,
            v.preview_path IS NOT NULL AS has_preview
     FROM files f
     JOIN model_versions v ON v.id = f.version_id
     JOIN models m ON m.id = v.model_id
     JOIN users u ON u.id = m.author_id
     WHERE m.team_id = $1 AND f.checksum = $2 AND f.job_id IS NULL
     LIMIT 1`,
    [teamId, checksum],
  );
  return result.rows[0];
}

export async function lockTeam(client: PoolClient, teamId: number): Promise<void> {
  await client.query("SELECT id FROM teams WHERE id = $1 FOR UPDATE", [teamId]);
}

export async function collectionExists(client: PoolClient, teamId: number, collectionId: number): Promise<boolean> {
  const result = await client.query("SELECT 1 FROM collections WHERE id = $1 AND team_id = $2", [collectionId, teamId]);
  return result.rows.length > 0;
}

export async function insertModel(client: PoolClient, teamId: number, authorId: number, name: string, description: string | null): Promise<number> {
  const result = await client.query<{ id: number }>(
    "INSERT INTO models (team_id, author_id, name, description) VALUES ($1, $2, $3, $4) RETURNING id",
    [teamId, authorId, name, description],
  );
  return result.rows[0].id;
}

export interface NewVersion {
  modelId: number;
  number: number;
  comment: string | null;
  triangles: number;
  vertices: number;
  hasSkeleton: boolean;
  size: [number, number, number];
}

export async function insertVersion(client: PoolClient, version: NewVersion): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO model_versions (model_id, version_number, comment, triangles_count, vertices_count, has_skeleton, size_x, size_y, size_z)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [version.modelId, version.number, version.comment, version.triangles, version.vertices, version.hasSkeleton, version.size[0], version.size[1], version.size[2]],
  );
  return result.rows[0].id;
}

export interface NewFile {
  format: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  checksum: string;
}

export async function insertFile(client: PoolClient, versionId: number, file: NewFile): Promise<void> {
  await client.query(
    `INSERT INTO files (version_id, format, file_name, storage_path, size_bytes, checksum)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [versionId, file.format, file.fileName, file.storagePath, file.sizeBytes, file.checksum],
  );
}

export interface NewTexture {
  fileName: string;
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export async function insertTexture(client: PoolClient, versionId: number, texture: NewTexture): Promise<void> {
  await client.query(
    `INSERT INTO textures (version_id, file_name, storage_path, width, height, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [versionId, texture.fileName, texture.storagePath, texture.width, texture.height, texture.sizeBytes],
  );
}

export async function insertMaterial(client: PoolClient, versionId: number, name: string): Promise<void> {
  await client.query("INSERT INTO materials (version_id, name) VALUES ($1, $2)", [versionId, name]);
}

export async function addTag(client: PoolClient, teamId: number, modelId: number, name: string, isAuto: boolean): Promise<void> {
  const tag = await client.query<{ id: number }>(
    `INSERT INTO tags (team_id, name) VALUES ($1, $2)
     ON CONFLICT (team_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [teamId, name],
  );
  await client.query(
    "INSERT INTO model_tags (model_id, tag_id, is_auto) VALUES ($1, $2, $3) ON CONFLICT (model_id, tag_id) DO NOTHING",
    [modelId, tag.rows[0].id, isAuto],
  );
}

export async function addToCollection(client: PoolClient, collectionId: number, modelId: number): Promise<void> {
  await client.query("INSERT INTO collection_models (collection_id, model_id) VALUES ($1, $2)", [collectionId, modelId]);
}

export async function logAction(client: PoolClient, userId: number, teamId: number, action: "create" | "update", details: string): Promise<void> {
  await client.query(
    "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, $3, $4)",
    [userId, teamId, action, details],
  );
}

export async function findModelForVersion(client: PoolClient, teamId: number, modelId: number): Promise<{ author_id: number; name: string } | undefined> {
  const result = await client.query<{ author_id: number; name: string }>(
    "SELECT author_id, name FROM models WHERE id = $1 AND team_id = $2",
    [modelId, teamId],
  );
  return result.rows[0];
}

export async function getNextVersionNumber(client: PoolClient, modelId: number): Promise<number> {
  const result = await client.query<{ next: number }>(
    "SELECT COALESCE(max(version_number), 0) + 1 AS next FROM model_versions WHERE model_id = $1",
    [modelId],
  );
  return result.rows[0].next;
}

export async function removeAutoTags(client: PoolClient, modelId: number): Promise<void> {
  await client.query("DELETE FROM model_tags WHERE model_id = $1 AND is_auto = true", [modelId]);
}

export async function touchModel(client: PoolClient, modelId: number): Promise<void> {
  await client.query("UPDATE models SET updated_at = now() WHERE id = $1", [modelId]);
}

export interface PreviewTarget {
  version_id: number;
  author_id: number;
  preview_path: string | null;
  file_path: string;
}

export async function findPreviewTarget(teamId: number, modelId: number): Promise<PreviewTarget | undefined> {
  const result = await db.query<PreviewTarget>(
    `SELECT v.id AS version_id, m.author_id, v.preview_path,
            (SELECT f.storage_path FROM files f WHERE f.version_id = v.id ORDER BY f.id LIMIT 1) AS file_path
     FROM models m
     JOIN LATERAL (
       SELECT * FROM model_versions WHERE model_id = m.id ORDER BY version_number DESC LIMIT 1
     ) v ON true
     WHERE m.id = $1 AND m.team_id = $2`,
    [modelId, teamId],
  );
  return result.rows[0];
}

export async function setPreviewPath(versionId: number, path: string): Promise<void> {
  await db.query("UPDATE model_versions SET preview_path = $1 WHERE id = $2", [path, versionId]);
}
