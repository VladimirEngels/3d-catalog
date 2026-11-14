
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { PoolClient } from "pg";

import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { db, transaction } from "../../db";
import { AppError } from "../../errors";
import { log } from "../../logger";
import type { Role } from "../../middleware/team-access";
import { absolutePath, createVersionFolder, removeFolder } from "../../storage";
import type { UserRow } from "../accounts/repository";
import { readId, readText } from "../accounts/validation";
import { getExtension, prepareSource } from "./archive";
import { readImageInfo } from "./image-size";
import { parseModel } from "./parse-model";
import type { ParsedModel, TextureSource } from "./parsers/types";
import * as repository from "./repository";
import type { DuplicateRow, NewFile, NewTexture } from "./repository";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const HEAVY_MODEL_TRIANGLES = 100000;
const MAX_PREVIEW_SIDE = 4096;

export interface UploadedFile {
  originalName: string;
  path: string;
}

export interface UploadRequest {
  file: UploadedFile;
  name: unknown;
  description: unknown;
  tags: unknown;
  collectionId: unknown;
}

interface PreparedVersion {
  parsed: ParsedModel;
  fileName: string;
  format: string;
  checksum: string;
  files: NewFile[];
  textures: NewTexture[];
}

async function storeFile<T>(
  teamId: number,
  file: UploadedFile,
  writeToDatabase: (client: PoolClient, prepared: PreparedVersion) => Promise<T>,
): Promise<T> {
  const workFolder = await mkdtemp(join(tmpdir(), "3d-katalog-"));
  try {
    const source = await prepareSource(file.originalName, file.path, workFolder);
    const parsed = await parseModel(source);
    const checksum = await calculateChecksum(source.path);

    const duplicate = await repository.findDuplicate(db, teamId, checksum);
    if (duplicate) {
      throw duplicateError(duplicate);
    }

    const folder = await createVersionFolder();
    try {
      const mainFile = await saveMainFile(source.path, source.fileName, source.format, checksum, folder);
      const companions = await saveCompanions(parsed, source.format, folder);
      const textures = await saveTextures(parsed.textures, folder);

      return await transaction(async (client) => {
        await repository.lockTeam(client, teamId);

        const lateDuplicate = await repository.findDuplicate(client, teamId, checksum);
        if (lateDuplicate) {
          throw duplicateError(lateDuplicate);
        }
        return writeToDatabase(client, {
          parsed,
          fileName: source.fileName,
          format: source.format,
          checksum,
          files: [mainFile, ...companions],
          textures,
        });
      });
    } catch (error) {
      await removeFolder(folder);
      throw error;
    }
  } finally {
    await rm(workFolder, { recursive: true, force: true });
  }
}

async function insertPreparedVersion(client: PoolClient, modelId: number, number: number, comment: string | null, prepared: PreparedVersion): Promise<void> {
  const { parsed } = prepared;
  const versionId = await repository.insertVersion(client, {
    modelId,
    number,
    comment,
    triangles: parsed.triangles,
    vertices: parsed.vertices,
    hasSkeleton: parsed.hasSkeleton,
    size: parsed.size,
  });

  for (const file of prepared.files) {
    await repository.insertFile(client, versionId, file);
  }
  for (const texture of prepared.textures) {
    await repository.insertTexture(client, versionId, texture);
  }
  for (const material of parsed.materials) {
    await repository.insertMaterial(client, versionId, material.slice(0, 100));
  }
}

export async function addModel(user: UserRow, teamId: number, request: UploadRequest) {
  const name = readText(request.name).trim();
  const description = readText(request.description).trim();
  const manualTags = readManualTags(request.tags);
  const collectionId = request.collectionId ? readId(request.collectionId) : null;

  if (name === "" || name.length > MAX_NAME_LENGTH) {
    throw new AppError(400, `Укажите название модели длиной до ${MAX_NAME_LENGTH} символов`);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, `Описание должно быть не длиннее ${MAX_DESCRIPTION_LENGTH} символов`);
  }

  return storeFile(teamId, request.file, async (client, prepared) => {
    if (collectionId !== null && !(await repository.collectionExists(client, teamId, collectionId))) {
      throw new AppError(400, "Такой коллекции в команде нет");
    }

    const modelId = await repository.insertModel(client, teamId, user.id, name, description || null);
    await insertPreparedVersion(client, modelId, 1, null, prepared);

    for (const tag of getAutoTags(prepared.parsed)) {
      await repository.addTag(client, teamId, modelId, tag, true);
    }
    for (const tag of manualTags) {
      await repository.addTag(client, teamId, modelId, tag, false);
    }
    if (collectionId !== null) {
      await repository.addToCollection(client, collectionId, modelId);
    }
    await repository.logAction(client, user.id, teamId, "create", `Добавлена модель «${name}» (${prepared.fileName})`);

    log("INFO", `Модель добавлена: ${modelId}, команда ${teamId}, ${prepared.format}, треугольников ${prepared.parsed.triangles}`);
    return { modelId, textureCount: prepared.textures.length };
  });
}

export async function addVersion(user: UserRow, teamId: number, role: Role, modelId: number, file: UploadedFile, commentValue: unknown) {
  const comment = readText(commentValue).trim();
  if (comment.length > 500) {
    throw new AppError(400, "Комментарий должен быть не длиннее 500 символов");
  }

  return storeFile(teamId, file, async (client, prepared) => {
    const model = await repository.findModelForVersion(client, teamId, modelId);
    if (!model) {
      throw new AppError(404, "Модель не найдена");
    }
    if (model.author_id !== user.id && role !== "owner") {
      throw new AppError(403, "Новую версию может добавить автор модели или владелец команды");
    }

    const number = await repository.getNextVersionNumber(client, modelId);
    await insertPreparedVersion(client, modelId, number, comment || null, prepared);

    await repository.removeAutoTags(client, modelId);
    for (const tag of getAutoTags(prepared.parsed)) {
      await repository.addTag(client, teamId, modelId, tag, true);
    }
    await repository.touchModel(client, modelId);
    await repository.logAction(client, user.id, teamId, "update", `Новая версия ${number} модели «${model.name}»`);

    log("INFO", `Новая версия: модель ${modelId}, версия ${number}`);
    return { versionNumber: number };
  });
}

function getAutoTags(parsed: ParsedModel): string[] {
  const tags: string[] = [];
  if (parsed.hasSkeleton) {
    tags.push("персонаж");
  }
  if (parsed.triangles > HEAVY_MODEL_TRIANGLES) {
    tags.push("тяжёлая модель");
  }
  return tags;
}

function readManualTags(value: unknown): string[] {
  const tags = new Set<string>();
  for (const part of readText(value).split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag !== "") {
      tags.add(tag);
    }
  }
  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      throw new AppError(400, `Тег должен быть не длиннее ${MAX_TAG_LENGTH} символов`);
    }
  }
  if (tags.size > MAX_TAGS) {
    throw new AppError(400, `Можно указать не больше ${MAX_TAGS} тегов`);
  }
  return [...tags];
}

function duplicateError(duplicate: DuplicateRow): AppError {
  return new AppError(409, "Эта модель уже есть в каталоге", {
    duplicate: {
      id: duplicate.id,
      name: duplicate.name,
      authorName: duplicate.author_name,
      createdAt: duplicate.created_at,
      format: duplicate.format,
      triangles: duplicate.triangles_count,
      hasPreview: duplicate.has_preview,
    },
  });
}

async function calculateChecksum(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function saveMainFile(path: string, fileName: string, format: string, checksum: string, folder: string): Promise<NewFile> {
  const storagePath = posix.join(folder, `model.${format.toLowerCase()}`);
  await copyFile(path, absolutePath(storagePath));
  return {
    format,
    fileName: fileName.slice(-255),
    storagePath,
    sizeBytes: (await stat(path)).size,
    checksum,
  };
}

async function saveCompanions(parsed: ParsedModel, format: string, folder: string): Promise<NewFile[]> {
  const saved: NewFile[] = [];
  const seenPaths = new Set<string>();

  for (const file of parsed.companions) {
    if (seenPaths.has(file.path)) {
      continue;
    }
    seenPaths.add(file.path);

    const extension = getExtension(file.name) === "mtl" ? "mtl" : "bin";
    const storagePath = posix.join(folder, `part-${saved.length + 1}.${extension}`);
    await copyFile(file.path, absolutePath(storagePath));
    saved.push({
      format,
      fileName: file.name.slice(-255),
      storagePath,
      sizeBytes: (await stat(file.path)).size,
      checksum: await calculateChecksum(file.path),
    });
  }
  return saved;
}

async function saveTextures(sources: TextureSource[], folder: string): Promise<NewTexture[]> {
  const saved: NewTexture[] = [];

  for (const source of sources) {
    const data = "bytes" in source ? source.bytes : await readFile(source.path);
    const info = readImageInfo(data);
    if (!info || info.width <= 0 || info.height <= 0) {
      log("WARN", `Текстура пропущена: неизвестный формат картинки, папка ${folder}`);
      continue;
    }

    const baseName = "bytes" in source ? source.name.replace(/[\\/:*?"<>|]/g, "_") : source.name;
    const hasExtension = getExtension(baseName) !== "";
    const fileName = hasExtension ? baseName : `${baseName}.${info.extension}`;
    const storagePath = posix.join(folder, `texture-${saved.length + 1}.${info.extension}`);
    await writeFile(absolutePath(storagePath), data);

    saved.push({ fileName: fileName.slice(-255), storagePath, width: info.width, height: info.height, sizeBytes: data.length });
  }
  return saved;
}


export async function savePreview(user: UserRow, teamId: number, role: Role, modelId: number, image: Buffer): Promise<void> {
  const target = await repository.findPreviewTarget(teamId, modelId);
  if (!target) {
    throw new AppError(404, "Модель не найдена");
  }
  if (target.author_id !== user.id && role !== "owner") {
    throw new AppError(403, "Превью может обновить автор модели или владелец команды");
  }

  const info = readImageInfo(image);
  if (!info || info.extension !== "png" || info.width > MAX_PREVIEW_SIDE || info.height > MAX_PREVIEW_SIDE) {
    throw new AppError(400, "Превью должно быть картинкой PNG");
  }

  const previewPath = posix.join(posix.dirname(target.file_path), "preview.png");
  await writeFile(absolutePath(previewPath), image);
  await repository.setPreviewPath(target.version_id, previewPath);
}
