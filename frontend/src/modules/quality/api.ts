import { request } from "@shared/api/http";

export interface QualityReport {
  jobId: number;
  sourceFormat: string;
  targetFormat: string;
  finishedAt: string | null;
  similarity: number | null;
  method: "demo" | "structure";
  before?: GeometrySummary;
  after?: GeometrySummary;
  needsReview: boolean;
  losses: string[];
  defects: string[];
}

export interface GeometrySummary {
  vertices: number;
  triangles: number;
  meshes: number;
  size: number[];
  hasUv: boolean;
  hasTextures: boolean;
  hasSkeleton: boolean;
}

export function getQualityReports(teamId: number, modelId: number): Promise<QualityReport[]> {
  return request("GET", `/teams/${teamId}/models/${modelId}/quality`);
}
