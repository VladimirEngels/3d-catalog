
import { Router, type Response } from "express";
import { posix } from "node:path";
import yazl from "yazl";
import { AppError } from "../../errors";
import { log } from "../../logger";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { absolutePath, removeFoldersOfFiles } from "../../storage";
import { readId, readText } from "../accounts/validation";
import * as repository from "./model-repository";
import type { FileRow, ModelRow, TextureRow } from "./model-repository";

export const modelRouter = Router();

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

async function requireModel(res: Response, modelIdValue: unknown): Promise<ModelRow> {
  const model = await repository.findModel(res.locals.team.id, readId(modelIdValue));
  if (!model) {
    throw new AppError(404, "Модель не найдена");
  }
  return model;
}

function canEdit(res: Response, model: ModelRow): boolean {
  const role = res.locals.team.role;
  return role === "owner" || (role === "member" && model.author_id === res.locals.user.id);
}

function fileForClient(file: FileRow) {
  return {
    id: file.id,
    name: file.file_name,
    format: file.format,
    sizeBytes: Number(file.size_bytes),
    converted: file.job_id !== null,
    createdAt: file.created_at,
  };
}

function texturesForClient(textures: TextureRow[]) {
  return textures
    .filter((texture) => texture.source_texture_id === null)
    .map((texture) => {
      const improved = textures.find((item) => item.source_texture_id === texture.id);
      return {
        id: texture.id,
        name: texture.file_name,
        width: texture.width,
        height: texture.height,
        sizeBytes: Number(texture.size_bytes),
        improved: improved ? { id: improved.id, width: improved.width, height: improved.height } : null,
      };
    });
}

modelRouter.get("/teams/:teamId/models/:modelId", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const model = await requireModel(res, req.params.modelId);
  const versions = await repository.listVersions(model.id);
  const current = versions[0];

  const [tags, collections, materials, files, textures] = await Promise.all([
    repository.listTags(model.id),
    repository.listModelCollections(model.id),
    repository.listMaterials(current.id),
    repository.listAllVersionFiles(current.id),
    repository.listAllVersionTextures(current.id),
  ]);

  res.json({
    id: model.id,
    name: model.name,
    description: model.description,
    authorName: model.author_name,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    canEdit: canEdit(res, model),
    canDelete: res.locals.team.role === "owner",
    tags: tags.map((tag) => ({ name: tag.name, isAuto: tag.is_auto })),
    collections,
    current: {
      versionId: current.id,
      versionNumber: current.version_number,
      format: files[0].format,
      triangles: current.triangles_count,
      vertices: current.vertices_count,
      hasSkeleton: current.has_skeleton,
      size: [current.size_x, current.size_y, current.size_z],
      sizeBytes: Number(current.size_bytes),
      hasPreview: current.preview_path !== null,
      materials,
    },
    files: files.map(fileForClient),
    textures: texturesForClient(textures),
    versions: versions.map((version) => ({
      id: version.id,
      number: version.version_number,
      comment: version.comment,
      triangles: version.triangles_count,
      sizeBytes: Number(version.size_bytes),
      createdAt: version.created_at,
    })),
  });
});

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AppError(400, "Неверный список тегов");
  }
  const tags = new Set<string>();
  for (const item of value) {
    const tag = readText(item).trim().toLowerCase();
    if (tag.length > MAX_TAG_LENGTH) {
      throw new AppError(400, `Тег должен быть не длиннее ${MAX_TAG_LENGTH} символов`);
    }
    if (tag !== "") {
      tags.add(tag);
    }
  }
  if (tags.size > MAX_TAGS) {
    throw new AppError(400, `Можно указать не больше ${MAX_TAGS} тегов`);
  }
  return [...tags];
}

modelRouter.patch("/teams/:teamId/models/:modelId", requireAuth, requireTeamRole("member"), async (req, res) => {
  const model = await requireModel(res, req.params.modelId);
  if (!canEdit(res, model)) {
    throw new AppError(403, "Изменять описание и теги может автор модели или владелец команды");
  }

  const description = readText(req.body?.description).trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, `Описание должно быть не длиннее ${MAX_DESCRIPTION_LENGTH} символов`);
  }
  const tags = readTags(req.body?.tags);

  await repository.updateDescription(model.id, description || null);
  await repository.replaceManualTags(res.locals.team.id, model.id, tags);
  await repository.logModelAction(res.locals.user.id, res.locals.team.id, "update", `Изменены описание и теги модели «${model.name}»`);
  log("INFO", `Модель изменена: ${model.id}`);
  res.status(204).end();
});

modelRouter.delete("/teams/:teamId/models/:modelId", requireAuth, requireTeamRole("owner"), async (req, res) => {
  const model = await requireModel(res, req.params.modelId);
  const paths = await repository.listModelStoragePaths(model.id);

  await repository.deleteModel(model.id);
  await removeFoldersOfFiles(paths);

  await repository.logModelAction(res.locals.user.id, res.locals.team.id, "delete", `Удалена модель «${model.name}»`);
  log("INFO", `Модель удалена: ${model.id}`);
  res.status(204).end();
});

modelRouter.get("/teams/:teamId/models/:modelId/files/:fileId/download", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const model = await requireModel(res, req.params.modelId);
  const fileId = readId(req.params.fileId);

  const versions = await repository.listVersions(model.id);
  let file: FileRow | undefined;
  for (const version of versions) {
    file = (await repository.listAllVersionFiles(version.id)).find((item) => item.id === fileId);
    if (file) {
      break;
    }
  }
  if (!file) {
    throw new AppError(404, "Файл не найден");
  }

  const fileName = posix.basename(file.file_name);
  await repository.logModelAction(res.locals.user.id, res.locals.team.id, "download", `Скачан файл ${fileName} модели «${model.name}»`);

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.attachment(fileName);
  res.type("application/octet-stream");
  res.sendFile(absolutePath(file.storage_path), { dotfiles: "allow" });
});

function uniqueName(name: string, used: Set<string>): string {
  let result = name;
  let number = 2;
  while (used.has(result.toLowerCase())) {
    const dot = name.lastIndexOf(".");
    result = dot === -1 ? `${name}-${number}` : `${name.slice(0, dot)}-${number}${name.slice(dot)}`;
    number++;
  }
  used.add(result.toLowerCase());
  return result;
}

modelRouter.get("/teams/:teamId/models/:modelId/versions/:versionId/download", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const model = await requireModel(res, req.params.modelId);
  const version = await repository.findVersion(res.locals.team.id, model.id, readId(req.params.versionId));
  if (!version) {
    throw new AppError(404, "Версия не найдена");
  }

  const allFiles = await repository.listAllVersionFiles(version.id);
  const uploaded = allFiles.filter((file) => file.job_id === null);
  const textures = uploaded[0].format === "GLB"
    ? []
    : (await repository.listAllVersionTextures(version.id)).filter((texture) => texture.source_texture_id === null);

  await repository.logModelAction(res.locals.user.id, res.locals.team.id, "download", `Скачана версия ${version.version_number} модели «${model.name}»`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (uploaded.length === 1 && textures.length === 0) {
    res.attachment(posix.basename(uploaded[0].file_name));
    res.type("application/octet-stream");
    res.sendFile(absolutePath(uploaded[0].storage_path), { dotfiles: "allow" });
    return;
  }

  const archive = new yazl.ZipFile();
  const used = new Set<string>();
  for (const item of [...uploaded, ...textures]) {
    archive.addFile(absolutePath(item.storage_path), uniqueName(item.file_name, used));
  }
  archive.end();

  res.attachment(`${model.name.replace(/[\\/:*?"<>|]/g, "_")}-v${version.version_number}.zip`);
  res.type("application/zip");
  archive.outputStream.pipe(res);
});
