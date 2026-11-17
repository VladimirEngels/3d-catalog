import { request } from "@shared/api/http";

export interface QualityReport {
  jobId: number;
  sourceFormat: string;
  targetFormat: string;
  finishedAt: string | null;
  similarity: number | null;
  method: "demo" | "structure" | "visual";
  visual?:
    | {
        status: "done";
        method: string;
        score: number;
        threshold: number;
        views: { name: string; score: number | null; index: number }[];
      }
    | { status: "unavailable"; message: string };
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
