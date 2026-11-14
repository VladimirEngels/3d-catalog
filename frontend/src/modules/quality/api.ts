
import { request } from "@shared/api/http";

export interface QualityReport {
  jobId: number;
  sourceFormat: string;
  targetFormat: string;
  finishedAt: string | null;
  similarity: number;
  needsReview: boolean;
  losses: string[];
  defects: string[];
}

export function getQualityReports(teamId: number, modelId: number): Promise<QualityReport[]> {
  return request("GET", `/teams/${teamId}/models/${modelId}/quality`);
}
