
import { request } from "@shared/api/http";

export type ModelFormat = "OBJ" | "STL" | "PLY" | "GLTF" | "GLB";
export type CatalogSort = "new" | "name" | "size" | "quality";

export interface CatalogFilters {
  query: string;
  formats: ModelFormat[];
  skeleton: boolean;
  textures: boolean;
  minTriangles: string;
  maxTriangles: string;
  quality: "" | "good" | "review";
  author: string;
  collection: string;
  days: string;
  sort: CatalogSort;
}

export interface CatalogItem {
  id: number;
  name: string;
  authorName: string;
  createdAt: string;
  format: ModelFormat;
  triangles: number;
  hasPreview: boolean;
  hasSkeleton: boolean;
  hasTextures: boolean;
  sizeBytes: number;
  quality: number | null;
  tags: string[];
}

export interface CatalogResponse {
  items: CatalogItem[];
  found: number;
  pageSize: number;
  teamTotal: number;
  facets: {
    withSkeleton: number;
    withTextures: number;
    formats: Partial<Record<ModelFormat, number>>;
    authors: { id: number; name: string }[];
  };
}

export interface ModelView {
  format: ModelFormat;
  mainUrl: string;
  assets: { name: string; url: string }[];
}

export function getModels(teamId: number, filters: CatalogFilters, page: number): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  params.set("sort", filters.sort);
  params.set("page", String(page));
  if (filters.query.trim() !== "") params.set("q", filters.query.trim());
  if (filters.formats.length > 0) params.set("formats", filters.formats.join(","));
  if (filters.skeleton) params.set("skeleton", "1");
  if (filters.textures) params.set("textures", "1");
  if (filters.minTriangles !== "") params.set("minTriangles", filters.minTriangles);
  if (filters.maxTriangles !== "") params.set("maxTriangles", filters.maxTriangles);
  if (filters.quality !== "") params.set("quality", filters.quality);
  if (filters.author !== "") params.set("author", filters.author);
  if (filters.collection !== "") params.set("collection", filters.collection);
  if (filters.days !== "") params.set("days", filters.days);
  return request("GET", `/teams/${teamId}/models?${params}`);
}

export function getModelView(teamId: number, modelId: number): Promise<ModelView> {
  return request("GET", `/teams/${teamId}/models/${modelId}/view`);
}


export interface Collection {
  id: number;
  name: string;
  modelCount: number;
  previewModels: number[];
}

export function getCollections(teamId: number): Promise<Collection[]> {
  return request("GET", `/teams/${teamId}/collections`);
}

export function createCollection(teamId: number, name: string): Promise<{ id: number; name: string }> {
  return request("POST", `/teams/${teamId}/collections`, { name });
}

export function renameCollection(teamId: number, collectionId: number, name: string): Promise<void> {
  return request("PATCH", `/teams/${teamId}/collections/${collectionId}`, { name });
}

export function deleteCollection(teamId: number, collectionId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/collections/${collectionId}`);
}

export function addModelsToCollection(teamId: number, collectionId: number, modelIds: number[]): Promise<void> {
  return request("POST", `/teams/${teamId}/collections/${collectionId}/models`, { modelIds });
}

export function removeModelFromCollection(teamId: number, collectionId: number, modelId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/collections/${collectionId}/models/${modelId}`);
}

export function previewUrl(teamId: number, modelId: number): string {
  return `/api/teams/${teamId}/models/${modelId}/preview`;
}

export function savePreview(teamId: number, modelId: number, image: Blob): Promise<void> {
  const form = new FormData();
  form.append("preview", image, "preview.png");
  return request("POST", `/teams/${teamId}/models/${modelId}/preview`, form);
}


export interface ModelFile {
  id: number;
  name: string;
  format: ModelFormat;
  sizeBytes: number;
  converted: boolean;
  createdAt: string;
}

export interface ModelTexture {
  id: number;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  improved: { id: number; width: number; height: number } | null;
}

export interface ModelVersion {
  id: number;
  number: number;
  comment: string | null;
  triangles: number;
  sizeBytes: number;
  createdAt: string;
}

export interface ModelCard {
  id: number;
  name: string;
  description: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  tags: { name: string; isAuto: boolean }[];
  collections: { id: number; name: string }[];
  current: {
    versionId: number;
    versionNumber: number;
    format: ModelFormat;
    triangles: number;
    vertices: number;
    hasSkeleton: boolean;
    size: [number, number, number];
    sizeBytes: number;
    hasPreview: boolean;
    materials: string[];
  };
  files: ModelFile[];
  textures: ModelTexture[];
  versions: ModelVersion[];
}

export function getModel(teamId: number, modelId: number): Promise<ModelCard> {
  return request("GET", `/teams/${teamId}/models/${modelId}`);
}

export function updateModel(teamId: number, modelId: number, description: string, tags: string[]): Promise<void> {
  return request("PATCH", `/teams/${teamId}/models/${modelId}`, { description, tags });
}

export function deleteModel(teamId: number, modelId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/models/${modelId}`);
}

export function fileDownloadUrl(teamId: number, modelId: number, fileId: number): string {
  return `/api/teams/${teamId}/models/${modelId}/files/${fileId}/download`;
}

export function versionDownloadUrl(teamId: number, modelId: number, versionId: number): string {
  return `/api/teams/${teamId}/models/${modelId}/versions/${versionId}/download`;
}

