
import { Router } from "express";
import { rm } from "node:fs/promises";
import multer from "multer";
import { tmpdir } from "node:os";
import { AppError } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { readId } from "../accounts/validation";
import * as service from "./service";

export const uploadRouter = Router();

const MAX_MODEL_BYTES = 100 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

const modelUpload = multer({ dest: tmpdir(), limits: { fileSize: MAX_MODEL_BYTES, files: 1 }, defParamCharset: "utf8" });
const previewUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PREVIEW_BYTES, files: 1 } });

uploadRouter.post(
  "/teams/:teamId/models",
  requireAuth,
  requireTeamRole("member"),
  modelUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "Выберите файл модели");
    }
    try {
      const result = await service.addModel(res.locals.user, res.locals.team.id, {
        file: { originalName: req.file.originalname, path: req.file.path },
        name: req.body.name,
        description: req.body.description,
        tags: req.body.tags,
        collectionId: req.body.collectionId,
      });
      res.status(201).json(result);
    } finally {
      await rm(req.file.path, { force: true });
    }
  },
);

uploadRouter.post(
  "/teams/:teamId/models/:modelId/versions",
  requireAuth,
  requireTeamRole("member"),
  modelUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "Выберите файл модели");
    }
    try {
      const team = res.locals.team;
      const file = { originalName: req.file.originalname, path: req.file.path };
      const result = await service.addVersion(res.locals.user, team.id, team.role, readId(req.params.modelId), file, req.body.comment);
      res.status(201).json(result);
    } finally {
      await rm(req.file.path, { force: true });
    }
  },
);

uploadRouter.post(
  "/teams/:teamId/models/:modelId/preview",
  requireAuth,
  requireTeamRole("member"),
  previewUpload.single("preview"),
  async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "Нет картинки превью");
    }
    const team = res.locals.team;
    await service.savePreview(res.locals.user, team.id, team.role, readId(req.params.modelId), req.file.buffer);
    res.status(204).end();
  },
);
