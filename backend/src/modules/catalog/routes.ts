
import { Router, type Request, type Response } from "express";
import { extname } from "node:path";
import { AppError } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import { absolutePath } from "../../storage";
import { readId, readText } from "../accounts/validation";
import * as repository from "./repository";
import type { CatalogFilters } from "./repository";

export const catalogRouter = Router();

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".bmp": "image/bmp" };

const PAGE_SIZE = 48;
const FORMATS = ["OBJ", "STL", "PLY", "GLTF", "GLB"];
const SORTS = ["new", "name", "size", "quality"];

function readNumber(value: unknown): number | null {
  const text = readText(value);
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return number <= 2147483647 ? number : null;
}

function readFilters(req: Request): CatalogFilters {
  const { query } = req;
  const days = readNumber(query.days);
  const page = readNumber(query.page) ?? 0;
  const sort = readText(query.sort);
  const quality = readText(query.quality);

  return {
    query: readText(query.q).trim().slice(0, 200),
    formats: readText(query.formats).split(",").filter((format) => FORMATS.includes(format)),
    hasSkeleton: query.skeleton === "1",
    hasTextures: query.textures === "1",
    minTriangles: readNumber(query.minTriangles),
    maxTriangles: readNumber(query.maxTriangles),
    quality: quality === "good" || quality === "review" ? quality : null,
    authorId: readNumber(query.author),
    collectionId: readNumber(query.collection),
    days: days !== null && days <= 36500 ? days : null,
    sort: SORTS.includes(sort) ? (sort as CatalogFilters["sort"]) : "new",
    limit: PAGE_SIZE,
    offset: Math.min(page, 1000000) * PAGE_SIZE,
  };
}

catalogRouter.get("/teams/:teamId/models", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const teamId = res.locals.team.id;
  const rows = await repository.listModels(teamId, readFilters(req));
  const facets = await repository.getFacets(teamId);

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      authorName: row.author_name,
      createdAt: row.created_at,
      format: row.format,
      triangles: row.triangles_count,
      hasPreview: row.has_preview,
      hasSkeleton: row.has_skeleton,
      hasTextures: row.has_textures,
      sizeBytes: Number(row.size_bytes),
      quality: row.quality === null ? null : Number(row.quality),
      tags: row.tags,
    })),
    found: rows.length > 0 ? Number(rows[0].total) : 0,
    pageSize: PAGE_SIZE,
    teamTotal: Number(facets.totals.total),
    facets: {
      withSkeleton: Number(facets.totals.with_skeleton),
      withTextures: Number(facets.totals.with_textures),
      formats: Object.fromEntries(facets.formats.map((row) => [row.format, Number(row.count)])),
      authors: facets.authors,
    },
  });
});

async function requireCurrentVersion(res: Response, modelId: number) {
  const version = await repository.findCurrentVersion(res.locals.team.id, modelId);
  if (!version) {
    throw new AppError(404, "Модель не найдена");
  }
  return version;
}

function sendStoredFile(res: Response, storagePath: string): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type("application/octet-stream");
  res.sendFile(absolutePath(storagePath), { dotfiles: "allow" });
}

catalogRouter.get("/teams/:teamId/models/:modelId/view", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const teamId = res.locals.team.id;
  const modelId = readId(req.params.modelId);
  const version = await requireCurrentVersion(res, modelId);
  const files = await repository.listVersionFiles(version.id);
  const textures = await repository.listVersionTextures(version.id);
  const base = `/api/teams/${teamId}/models/${modelId}`;

  res.json({
    format: files[0].format,
    mainUrl: `${base}/files/${files[0].id}`,
    assets: [
      ...files.slice(1).map((file) => ({ name: file.file_name, url: `${base}/files/${file.id}` })),
      ...textures.map((texture) => ({ name: texture.file_name, url: `${base}/textures/${texture.id}` })),
    ],
  });
});

catalogRouter.get("/teams/:teamId/models/:modelId/files/:fileId", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const path = await repository.findTeamFile(res.locals.team.id, readId(req.params.modelId), readId(req.params.fileId));
  if (!path) {
    throw new AppError(404, "Файл не найден");
  }
  sendStoredFile(res, path);
});

catalogRouter.get("/teams/:teamId/models/:modelId/textures/:textureId", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const path = await repository.findTeamTexture(res.locals.team.id, readId(req.params.modelId), readId(req.params.textureId));
  if (!path) {
    throw new AppError(404, "Текстура не найдена");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(IMAGE_TYPES[extname(path)] ?? "application/octet-stream");
  res.sendFile(absolutePath(path), { dotfiles: "allow" });
});

catalogRouter.get("/teams/:teamId/models/:modelId/preview", requireAuth, requireTeamRole("viewer"), async (req, res) => {
  const version = await requireCurrentVersion(res, readId(req.params.modelId));
  if (!version.preview_path) {
    throw new AppError(404, "Превью пока нет");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type("image/png");
  res.sendFile(absolutePath(version.preview_path), { dotfiles: "allow" });
});
