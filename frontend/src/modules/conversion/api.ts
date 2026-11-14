
import { request } from "@shared/api/http";

export type TargetFormat = "OBJ" | "GLB" | "STL" | "PLY";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ConversionResult {
  created: number[];
  skipped: { name: string; reason: string }[];
}

export interface Job {
  id: number;
  modelId: number;
  modelName: string;
  hasPreview: boolean;
  sourceFormat: string;
  targetFormat: string;
  upscaleTextures: boolean;
  status: JobStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  quality: number | null;
  needsReview: boolean | null;
  resultFileId: number | null;
  jobsBefore: number;
}

export interface JobsResponse {
  items: Job[];
  page: number;
  pageSize: number;
  counts: { all: number; active: number; done: number; failed: number };
}

export function createConversions(teamId: number, modelIds: number[], targetFormat: TargetFormat, upscaleTextures: boolean): Promise<ConversionResult> {
  return request("POST", `/teams/${teamId}/conversions`, { modelIds, targetFormat, upscaleTextures });
}

export function getJobs(teamId: number, status: string, page: number): Promise<JobsResponse> {
  return request("GET", `/teams/${teamId}/jobs?status=${status}&page=${page}`);
}

export function cancelJob(teamId: number, jobId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/jobs/${jobId}`);
}
