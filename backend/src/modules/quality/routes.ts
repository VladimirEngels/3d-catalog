import { Router } from "express";
import { db } from "../../db";
import { AppError } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId } from "../../validation";
import { readStructuralReport } from "./report";

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

qualityRouter.get(
  "/teams/:teamId/models/:modelId/quality",
  requireAuth,
  requireTeamRole("viewer"),
  async (req, res) => {
    const modelId = readId(req.params.modelId);
    const teamId = res.locals.team.id;

    const model = await db.query("SELECT 1 FROM models WHERE id = $1 AND team_id = $2", [
      modelId,
      teamId,
    ]);
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

    const structural = await db.query<{
      job_id: number;
      target_format: string;
      source_format: string;
      finished_at: Date;
      storage_path: string;
    }>(
      `SELECT j.id AS job_id, j.target_format, j.finished_at, f.storage_path,
        (SELECT original.format FROM files original WHERE original.version_id=v.id ORDER BY original.id LIMIT 1) AS source_format
       FROM model_versions v JOIN conversion_jobs j ON j.version_id=v.id
       JOIN LATERAL (SELECT storage_path FROM files WHERE job_id=j.id ORDER BY id LIMIT 1) f ON true
       WHERE v.model_id=$1 AND v.version_number=(SELECT max(version_number) FROM model_versions WHERE model_id=$1)
         AND j.status='done' AND NOT EXISTS(SELECT 1 FROM quality_checks q WHERE q.job_id=j.id)
       ORDER BY j.finished_at DESC`,
      [modelId],
    );
    const generated = await Promise.all(
      structural.rows.map(async (row) => {
        const report = await readStructuralReport(row.storage_path);
        return report
          ? {
              jobId: row.job_id,
              sourceFormat: row.source_format,
              targetFormat: row.target_format,
              finishedAt: row.finished_at,
              similarity: null,
              method: "structure",
              ...report,
            }
          : null;
      }),
    );
    const legacy = checks.rows.map((check) => {
      const own = issues.rows.filter((issue) => issue.check_id === check.check_id);
      return {
        jobId: check.job_id,
        sourceFormat: check.source_format,
        targetFormat: check.target_format,
        finishedAt: check.finished_at,
        similarity: Number(check.similarity_percent),
        method: "demo",
        needsReview: check.needs_review,
        losses: own.filter((issue) => issue.kind === "loss").map((issue) => issue.message),
        defects: own.filter((issue) => issue.kind === "defect").map((issue) => issue.message),
      };
    });
    const reports = [...generated.filter((report) => report !== null), ...legacy];
    reports.sort(
      (a, b) => new Date(b.finishedAt ?? 0).getTime() - new Date(a.finishedAt ?? 0).getTime(),
    );
    res.json(reports);
  },
);
