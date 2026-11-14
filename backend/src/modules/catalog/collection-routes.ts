
import { Router, type Response } from "express";
import { db } from "../../db";
import { AppError } from "../../errors";
import { log } from "../../logger";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId, readText } from "../accounts/validation";

export const collectionRouter = Router();

const MAX_NAME_LENGTH = 100;
const MAX_MODELS_AT_ONCE = 500;

interface CollectionRow {
  id: number;
  name: string;
  model_count: string;
  preview_models: number[];
}

async function readUniqueName(teamId: number, value: unknown, ownId: number | null): Promise<string> {
  const name = readText(value).trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) {
    throw new AppError(400, `Укажите название коллекции длиной до ${MAX_NAME_LENGTH} символов`);
  }
  const same = await db.query(
    "SELECT id FROM collections WHERE team_id = $1 AND lower(name) = lower($2) AND id IS DISTINCT FROM $3",
    [teamId, name, ownId],
  );
  if (same.rows.length > 0) {
    throw new AppError(409, "Коллекция с таким названием уже есть");
  }
  return name;
}

async function requireCollection(res: Response, value: unknown): Promise<{ id: number; name: string }> {
  const result = await db.query<{ id: number; name: string }>(
    "SELECT id, name FROM collections WHERE id = $1 AND team_id = $2",
    [readId(value), res.locals.team.id],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, "Коллекция не найдена");
  }
  return result.rows[0];
}

async function logUpdate(res: Response, action: "create" | "update" | "delete", details: string): Promise<void> {
  await db.query(
    "INSERT INTO action_log (user_id, team_id, action, details) VALUES ($1, $2, $3, $4)",
    [res.locals.user.id, res.locals.team.id, action, details],
  );
}

collectionRouter.get("/teams/:teamId/collections", requireAuth, requireTeamRole("viewer"), async (_req, res) => {
  const result = await db.query<CollectionRow>(
    `SELECT c.id, c.name,
            (SELECT count(*) FROM collection_models cm WHERE cm.collection_id = c.id) AS model_count,
            ARRAY(
              SELECT cm.model_id
              FROM collection_models cm
              JOIN LATERAL (
                SELECT preview_path FROM model_versions WHERE model_id = cm.model_id ORDER BY version_number DESC LIMIT 1
              ) v ON true
              WHERE cm.collection_id = c.id AND v.preview_path IS NOT NULL
              ORDER BY cm.added_at DESC, cm.id DESC
              LIMIT 4
            ) AS preview_models
     FROM collections c
     WHERE c.team_id = $1
     ORDER BY lower(c.name)`,
    [res.locals.team.id],
  );
  res.json(result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    modelCount: Number(row.model_count),
    previewModels: row.preview_models,
  })));
});

collectionRouter.post("/teams/:teamId/collections", requireAuth, requireTeamRole("member"), async (req, res) => {
  const name = await readUniqueName(res.locals.team.id, req.body?.name, null);
  const result = await db.query<{ id: number }>(
    "INSERT INTO collections (team_id, name) VALUES ($1, $2) RETURNING id",
    [res.locals.team.id, name],
  );
  await logUpdate(res, "create", `Создана коллекция «${name}»`);
  log("INFO", `Коллекция создана: ${result.rows[0].id}, команда ${res.locals.team.id}`);
  res.status(201).json({ id: result.rows[0].id, name });
});

collectionRouter.patch("/teams/:teamId/collections/:collectionId", requireAuth, requireTeamRole("member"), async (req, res) => {
  const collection = await requireCollection(res, req.params.collectionId);
  const name = await readUniqueName(res.locals.team.id, req.body?.name, collection.id);
  await db.query("UPDATE collections SET name = $1 WHERE id = $2", [name, collection.id]);
  await logUpdate(res, "update", `Коллекция «${collection.name}» переименована в «${name}»`);
  res.status(204).end();
});

collectionRouter.delete("/teams/:teamId/collections/:collectionId", requireAuth, requireTeamRole("member"), async (req, res) => {
  const collection = await requireCollection(res, req.params.collectionId);
  await db.query("DELETE FROM collections WHERE id = $1", [collection.id]);
  await logUpdate(res, "delete", `Удалена коллекция «${collection.name}»`);
  res.status(204).end();
});

collectionRouter.post("/teams/:teamId/collections/:collectionId/models", requireAuth, requireTeamRole("member"), async (req, res) => {
  const collection = await requireCollection(res, req.params.collectionId);

  const value: unknown = req.body?.modelIds;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MODELS_AT_ONCE) {
    throw new AppError(400, "Укажите модели для добавления");
  }
  const modelIds = [...new Set(value.map(readId))];

  const found = await db.query("SELECT id FROM models WHERE id = ANY($1) AND team_id = $2", [modelIds, res.locals.team.id]);
  if (found.rows.length !== modelIds.length) {
    throw new AppError(404, "Модель не найдена");
  }

  await db.query(
    `INSERT INTO collection_models (collection_id, model_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT (collection_id, model_id) DO NOTHING`,
    [collection.id, modelIds],
  );
  await logUpdate(res, "update", `В коллекцию «${collection.name}» добавлено моделей: ${modelIds.length}`);
  res.status(204).end();
});

collectionRouter.delete("/teams/:teamId/collections/:collectionId/models/:modelId", requireAuth, requireTeamRole("member"), async (req, res) => {
  const collection = await requireCollection(res, req.params.collectionId);
  const result = await db.query(
    "DELETE FROM collection_models WHERE collection_id = $1 AND model_id = $2",
    [collection.id, readId(req.params.modelId)],
  );
  if (result.rowCount === 0) {
    throw new AppError(404, "Этой модели нет в коллекции");
  }
  await logUpdate(res, "update", `Модель убрана из коллекции «${collection.name}»`);
  res.status(204).end();
});
