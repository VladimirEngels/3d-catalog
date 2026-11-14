
import { Router } from "express";
import { db } from "../../db";
import { AppError } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId } from "../accounts/validation";

export const qualityRouter = Router();

interface CheckRow {
  job_id: number;
  target_format: string;
  source_format: string;
  finished_at: Date | null;
  similarity_percent: string;
  needs_review: boolean;
  check_id: number;
}

qualityRouter.get("/teams/:teamId/models/:modelId/quality", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const modelId = readId(req.params.modelId);
  const teamId = res.locals.team.id;

  const model = await db.query("SELECT 1 FROM models WHERE id = $1 AND team_id = $2", [modelId, teamId]);
  if (model.rows.length === 0) {
    throw new AppError(404, "Модель не найдена");
  }

  const checks = await db.query<CheckRow>(
    `SELECT j.id AS job_id, j.target_format, j.finished_at, q.id AS check_id, q.similarity_percent, q.needs_review,
            (SELECT f.format FROM files f WHERE f.version_id = v.id ORDER BY f.id LIMIT 1) AS source_format
     FROM (SELECT * FROM model_versions WHERE model_id = $1 ORDER BY version_number DESC LIMIT 1) v
     JOIN conversion_jobs j ON j.version_id = v.id
     JOIN quality_checks q ON q.job_id = j.id
     ORDER BY q.created_at DESC, q.id DESC`,
    [modelId],
  );

  const issues = await db.query<{ check_id: number; kind: "loss" | "defect"; message: string }>(
    "SELECT check_id, kind, message FROM quality_issues WHERE check_id = ANY($1) ORDER BY id",
    [checks.rows.map((check) => check.check_id)],
  );

  res.json(checks.rows.map((check) => {
    const own = issues.rows.filter((issue) => issue.check_id === check.check_id);
    return {
      jobId: check.job_id,
      sourceFormat: check.source_format,
      targetFormat: check.target_format,
      finishedAt: check.finished_at,
      similarity: Number(check.similarity_percent),
      needsReview: check.needs_review,
      losses: own.filter((issue) => issue.kind === "loss").map((issue) => issue.message),
      defects: own.filter((issue) => issue.kind === "defect").map((issue) => issue.message),
    };
  }));
});
