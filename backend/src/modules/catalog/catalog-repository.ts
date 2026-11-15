
import { db } from "../../db";

export interface CatalogFilters {
  query: string;
  formats: string[];
  hasSkeleton: boolean;
  hasTextures: boolean;
  minTriangles: number | null;
  maxTriangles: number | null;
  quality: "good" | "review" | null;
  authorId: number | null;
  collectionId: number | null;
  days: number | null;
  sort: "new" | "name" | "size" | "quality";
  limit: number;
  offset: number;
}

export interface CatalogRow {
  id: number;
  name: string;
  author_name: string;
  created_at: Date;
  format: string;
  triangles_count: number;
  has_preview: boolean;
  has_skeleton: boolean;
  has_textures: boolean;
  size_bytes: string;
  quality: string | null;
  tags: string[];
  total: string;
}

const CURRENT_VERSION = `
  JOIN LATERAL (
    SELECT * FROM model_versions WHERE model_id = m.id ORDER BY version_number DESC LIMIT 1
  ) v ON true`;

const QUALITY = `
  (SELECT q.similarity_percent
   FROM conversion_jobs j
   JOIN quality_checks q ON q.job_id = j.id
   WHERE j.version_id = v.id
   ORDER BY q.created_at DESC, q.id DESC
   LIMIT 1)`;

const SIZE = `(SELECT COALESCE(sum(f.size_bytes), 0) FROM files f WHERE f.version_id = v.id)`;

const SORTS: Record<CatalogFilters["sort"], string> = {
  new: "m.created_at DESC, m.id DESC",
  name: "m.name, m.id",
  size: `${SIZE} DESC, m.id DESC`,
  quality: `${QUALITY} DESC NULLS LAST, m.id DESC`,
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function listModels(teamId: number, filters: CatalogFilters): Promise<CatalogRow[]> {
  const params: unknown[] = [teamId];
  const conditions = ["m.team_id = $1"];

  function param(value: unknown): string {
    params.push(value);
    return `$${params.length}`;
  }

  if (filters.query !== "") {
    const search = param(`%${escapeLike(filters.query)}%`);
    conditions.push(
      `(m.name ILIKE ${search} OR m.description ILIKE ${search} OR EXISTS (
         SELECT 1 FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
         WHERE mt.model_id = m.id AND t.name ILIKE ${search}))`,
    );
  }
  if (filters.formats.length > 0) {
    const formats = param(filters.formats);
    conditions.push(
      `(EXISTS (SELECT 1 FROM files f WHERE f.version_id = v.id AND f.format = ANY(${formats}))
        OR EXISTS (
          SELECT 1 FROM conversion_jobs j JOIN files f ON f.job_id = j.id
          WHERE j.version_id = v.id AND f.format = ANY(${formats})))`,
    );
  }
  if (filters.hasSkeleton) {
    conditions.push("v.has_skeleton = true");
  }
  if (filters.hasTextures) {
    conditions.push("EXISTS (SELECT 1 FROM textures t WHERE t.version_id = v.id)");
  }
  if (filters.minTriangles !== null) {
    conditions.push(`v.triangles_count >= ${param(filters.minTriangles)}`);
  }
  if (filters.maxTriangles !== null) {
    conditions.push(`v.triangles_count <= ${param(filters.maxTriangles)}`);
  }
  if (filters.quality === "good") {
    conditions.push(`${QUALITY} >= 80`);
  } else if (filters.quality === "review") {
    conditions.push(`${QUALITY} < 80`);
  }
  if (filters.authorId !== null) {
    conditions.push(`m.author_id = ${param(filters.authorId)}`);
  }
  if (filters.collectionId !== null) {
    conditions.push(`EXISTS (SELECT 1 FROM collection_models cm WHERE cm.model_id = m.id AND cm.collection_id = ${param(filters.collectionId)})`);
  }
  if (filters.days !== null) {
    conditions.push(`m.created_at >= now() - ${param(filters.days)} * interval '1 day'`);
  }

  const result = await db.query<CatalogRow>(
    `SELECT m.id, m.name, u.name AS author_name, m.created_at, v.triangles_count,
            v.preview_path IS NOT NULL AS has_preview, v.has_skeleton,
            EXISTS (SELECT 1 FROM textures t WHERE t.version_id = v.id) AS has_textures,
            (SELECT f.format FROM files f WHERE f.version_id = v.id ORDER BY f.id LIMIT 1) AS format,
            ${SIZE} AS size_bytes,
            ${QUALITY} AS quality,
            ARRAY(
              SELECT t.name FROM model_tags mt JOIN tags t ON t.id = mt.tag_id
              WHERE mt.model_id = m.id ORDER BY t.name
            ) AS tags,
            count(*) OVER () AS total
     FROM models m
     JOIN users u ON u.id = m.author_id
     ${CURRENT_VERSION}
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${SORTS[filters.sort]}
     LIMIT ${param(filters.limit)} OFFSET ${param(filters.offset)}`,
    params,
  );
  return result.rows;
}

export async function getFacets(teamId: number) {
  const totals = await db.query<{ total: string; with_skeleton: string; with_textures: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE v.has_skeleton) AS with_skeleton,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM textures t WHERE t.version_id = v.id)) AS with_textures
     FROM models m ${CURRENT_VERSION}
     WHERE m.team_id = $1`,
    [teamId],
  );
  const formats = await db.query<{ format: string; count: string }>(
    `SELECT format, count(DISTINCT model_id) AS count
     FROM (
       SELECT f.format, m.id AS model_id
       FROM models m ${CURRENT_VERSION}
       JOIN files f ON f.version_id = v.id
       WHERE m.team_id = $1
       UNION ALL
       SELECT f.format, m.id AS model_id
       FROM models m ${CURRENT_VERSION}
       JOIN conversion_jobs j ON j.version_id = v.id
       JOIN files f ON f.job_id = j.id
       WHERE m.team_id = $1
     ) model_files
     GROUP BY format`,
    [teamId],
  );
  const authors = await db.query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
     FROM models m JOIN users u ON u.id = m.author_id
     WHERE m.team_id = $1
     ORDER BY u.name`,
    [teamId],
  );
  return { totals: totals.rows[0], formats: formats.rows, authors: authors.rows };
}

export interface StoredFileRow {
  id: number;
  file_name: string;
  format: string;
  storage_path: string;
}

export interface StoredTextureRow {
  id: number;
  file_name: string;
  storage_path: string;
}

export async function findCurrentVersion(teamId: number, modelId: number): Promise<{ id: number; preview_path: string | null } | undefined> {
  const result = await db.query<{ id: number; preview_path: string | null }>(
    `SELECT v.id, v.preview_path
     FROM models m ${CURRENT_VERSION}
     WHERE m.id = $1 AND m.team_id = $2`,
    [modelId, teamId],
  );
  return result.rows[0];
}

export async function listVersionFiles(versionId: number): Promise<StoredFileRow[]> {
  const result = await db.query<StoredFileRow>(
    "SELECT id, file_name, format, storage_path FROM files WHERE version_id = $1 ORDER BY id",
    [versionId],
  );
  return result.rows;
}

export async function listVersionTextures(versionId: number): Promise<StoredTextureRow[]> {
  const result = await db.query<StoredTextureRow>(
    "SELECT id, file_name, storage_path FROM textures WHERE version_id = $1 ORDER BY id",
    [versionId],
  );
  return result.rows;
}

export async function findTeamFile(teamId: number, modelId: number, fileId: number): Promise<string | undefined> {
  const result = await db.query<{ storage_path: string }>(
    `SELECT f.storage_path
     FROM files f
     LEFT JOIN conversion_jobs j ON j.id = f.job_id
     JOIN model_versions v ON v.id = COALESCE(f.version_id, j.version_id)
     JOIN models m ON m.id = v.model_id
     WHERE f.id = $1 AND m.id = $2 AND m.team_id = $3`,
    [fileId, modelId, teamId],
  );
  return result.rows[0]?.storage_path;
}

export async function findTeamTexture(teamId: number, modelId: number, textureId: number): Promise<string | undefined> {
  const result = await db.query<{ storage_path: string }>(
    `SELECT tx.storage_path
     FROM textures tx
     LEFT JOIN textures source ON source.id = tx.source_texture_id
     JOIN model_versions v ON v.id = COALESCE(tx.version_id, source.version_id)
     JOIN models m ON m.id = v.model_id
     WHERE tx.id = $1 AND m.id = $2 AND m.team_id = $3`,
    [textureId, modelId, teamId],
  );
  return result.rows[0]?.storage_path;
}

export async function listTeamStoragePaths(teamId: number): Promise<string[]> {
  const result = await db.query<{ path: string }>(
    `SELECT f.storage_path AS path
     FROM files f
     LEFT JOIN conversion_jobs j ON j.id = f.job_id
     JOIN model_versions v ON v.id = COALESCE(f.version_id, j.version_id)
     JOIN models m ON m.id = v.model_id
     WHERE m.team_id = $1`,
    [teamId],
  );
  return result.rows.map((row) => row.path);
}
