
import { Router } from "express";
import { db, transaction } from "../../db";
import { AppError } from "../../errors";
import { log } from "../../logger";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId, readText } from "../accounts/validation";

export const conversionRouter = Router();

const TARGET_FORMATS = ["OBJ", "GLB", "STL", "PLY"];
const FORMATS_WITH_TEXTURES = ["OBJ", "GLB"];
const MAX_MODELS_AT_ONCE = 200;
const PAGE_SIZE = 50;

const STATUS_GROUPS: Record<string, string[]> = {
  active: ["queued", "running"],
  done: ["done"],
  failed: ["failed"],
};

interface ModelToConvert {
  id: number;
  name: string;
  version_id: number;
  format: string;
  has_same_job: boolean;
}

conversionRouter.post("/teams/:teamId/conversions", requireAuth, requireTeamRole("member"), async (req, res) => {
  const value: unknown = req.body?.modelIds;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MODELS_AT_ONCE) {
    throw new AppError(400, "Выберите модели для перевода");
  }
  const modelIds = [...new Set(value.map(readId))];

  const targetFormat = readText(req.body?.targetFormat);
  if (!TARGET_FORMATS.includes(targetFormat)) {
    throw new AppError(400, "Выберите формат: OBJ, GLB, STL или PLY");
  }
  const upscaleTextures = req.body?.upscaleTextures === true;
  if (upscaleTextures && !FORMATS_WITH_TEXTURES.includes(targetFormat)) {
    throw new AppError(400, "Улучшение текстур доступно только для форматов с текстурами: OBJ и GLB");
  }

  const { user, team } = res.locals;

  const result = await transaction(async (client) => {
    const models = await client.query<ModelToConvert>(
      `SELECT m.id, m.name, v.id AS version_id,
              (SELECT f.format FROM files f WHERE f.version_id = v.id ORDER BY f.id LIMIT 1) AS format,
              EXISTS (
                SELECT 1 FROM conversion_jobs j
                WHERE j.version_id = v.id AND j.target_format = $3 AND j.status IN ('queued', 'running')
              ) AS has_same_job
       FROM models m
       JOIN LATERAL (
         SELECT * FROM model_versions WHERE model_id = m.id ORDER BY version_number DESC LIMIT 1
       ) v ON true
       WHERE m.id = ANY($1) AND m.team_id = $2`,
      [modelIds, team.id, targetFormat],
    );
    if (models.rows.length !== modelIds.length) {
      throw new AppError(404, "Модель не найдена");
    }

    const created: number[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const model of models.rows) {
      if (model.format === targetFormat) {
        skipped.push({ name: model.name, reason: `модель уже в формате ${targetFormat}` });
      } else if (model.has_same_job) {
        skipped.push({ name: model.name, reason: "такой перевод уже в очереди" });
      } else {
        const job = await client.query<{ id: number }>(
          `INSERT INTO conversion_jobs (version_id, created_by, target_format, upscale_textures)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [model.version_id, user.id, targetFormat, upscaleTextures],
        );
        created.push(job.rows[0].id);
        await client.query(
          "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, 'convert', $3)",
          [user.id, team.id, `Перевод модели «${model.name}»: ${model.format} → ${targetFormat}, в очереди`],
        );
      }
    }
    return { created, skipped };
  });

  log("INFO", `Задания созданы: команда ${team.id}, ${result.created.length} шт., формат ${targetFormat}`);
  res.status(201).json(result);
});

interface JobRow {
  id: number;
  model_id: number;
  model_name: string;
  has_preview: boolean;
  source_format: string;
  target_format: string;
  upscale_textures: boolean;
  status: string;
  error_message: string | null;
  created_at: Date;
  finished_at: Date | null;
  quality: string | null;
  needs_review: boolean | null;
  result_file_id: number | null;
  jobs_before: string;
}

conversionRouter.get("/teams/:teamId/jobs", requireAuth, requireTeamRole("member"), async (req, res) => {
  const { user, team } = res.locals;
  const group = STATUS_GROUPS[readText(req.query.status)] ?? null;
  const pageText = readText(req.query.page);
  const page = /^\d{1,6}$/.test(pageText) ? Number(pageText) : 0;

  const fromJobs = `
    FROM conversion_jobs j
    JOIN model_versions v ON v.id = j.version_id
    JOIN models m ON m.id = v.model_id
    WHERE m.team_id = $1 AND j.created_by = $2`;

  const rows = await db.query<JobRow>(
    `SELECT j.id, m.id AS model_id, m.name AS model_name, v.preview_path IS NOT NULL AS has_preview,
            (SELECT f.format FROM files f WHERE f.version_id = v.id ORDER BY f.id LIMIT 1) AS source_format,
            j.target_format, j.upscale_textures, j.status, j.error_message, j.created_at, j.finished_at,
            q.similarity_percent AS quality, q.needs_review,
            (SELECT f.id FROM files f WHERE f.job_id = j.id ORDER BY f.id LIMIT 1) AS result_file_id,
            (SELECT count(*) FROM conversion_jobs older WHERE older.status = 'queued' AND older.id < j.id) AS jobs_before
     FROM conversion_jobs j
     JOIN model_versions v ON v.id = j.version_id
     JOIN models m ON m.id = v.model_id
     LEFT JOIN quality_checks q ON q.job_id = j.id
     WHERE m.team_id = $1 AND j.created_by = $2 AND ($3::text[] IS NULL OR j.status = ANY($3))
     ORDER BY j.created_at DESC, j.id DESC
     LIMIT $4 OFFSET $5`,
    [team.id, user.id, group, PAGE_SIZE, page * PAGE_SIZE],
  );

  const counts = await db.query<{ status: string; count: string }>(
    `SELECT j.status, count(*) AS count ${fromJobs} GROUP BY j.status`,
    [team.id, user.id],
  );
  const countOf = (statuses: string[]) => counts.rows
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + Number(row.count), 0);

  res.json({
    items: rows.rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      modelName: row.model_name,
      hasPreview: row.has_preview,
      sourceFormat: row.source_format,
      targetFormat: row.target_format,
      upscaleTextures: row.upscale_textures,
      status: row.status,
      error: row.error_message,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      quality: row.quality === null ? null : Number(row.quality),
      needsReview: row.needs_review,
      resultFileId: row.result_file_id,
      jobsBefore: Number(row.jobs_before),
    })),
    page,
    pageSize: PAGE_SIZE,
    counts: {
      all: countOf(["queued", "running", "done", "failed"]),
      active: countOf(STATUS_GROUPS.active),
      done: countOf(STATUS_GROUPS.done),
      failed: countOf(STATUS_GROUPS.failed),
    },
  });
});

conversionRouter.delete("/teams/:teamId/jobs/:jobId", requireAuth, requireTeamRole("member"), async (req, res) => {
  const { user, team } = res.locals;
  const job = await db.query<{ id: number; status: string; created_by: number; model_name: string }>(
    `SELECT j.id, j.status, j.created_by, m.name AS model_name
     FROM conversion_jobs j
     JOIN model_versions v ON v.id = j.version_id
     JOIN models m ON m.id = v.model_id
     WHERE j.id = $1 AND m.team_id = $2`,
    [readId(req.params.jobId), team.id],
  );
  if (job.rows.length === 0) {
    throw new AppError(404, "Задание не найдено");
  }
  const found = job.rows[0];
  if (found.created_by !== user.id && team.role !== "owner") {
    throw new AppError(403, "Отменить задание может тот, кто его запустил, или владелец команды");
  }
  if (found.status !== "queued") {
    throw new AppError(409, "Отменить можно только задание в очереди");
  }

  await db.query("DELETE FROM conversion_jobs WHERE id = $1 AND status = 'queued'", [found.id]);
  await db.query(
    "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, 'convert', $3)",
    [user.id, team.id, `Отменён перевод модели «${found.model_name}»`],
  );
  res.status(204).end();
});
