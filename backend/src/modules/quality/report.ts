import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { absolutePath } from "../../storage";

export interface GeometrySummary {
  vertices: number;
  triangles: number;
  meshes: number;
  size: number[];
  min: number[];
  max: number[];
  hasUv: boolean;
  hasTextures: boolean;
  hasSkeleton: boolean;
}

export interface StructuralReport {
  before: GeometrySummary;
  after: GeometrySummary;
  losses: string[];
  defects: string[];
  needsReview: boolean;
  visual?: VisualReport;
  upscale?: UpscaleReport;
}

export interface UpscaleReport {
  model: string;
  message?: string;
  items: {
    status: "done" | "skipped";
    width: number;
    height: number;
    outputWidth?: number;
    outputHeight?: number;
    reason?: string;
  }[];
}

export type VisualReport =
  | {
      status: "done";
      method: string;
      score: number;
      threshold: number;
      views: { name: string; score: number | null; index: number }[];
    }
  | { status: "unavailable"; message: string };

export async function readStructuralReport(storagePath: string): Promise<StructuralReport | null> {
  let text: string;
  try {
    text = await readFile(
      absolutePath(posix.join(posix.dirname(storagePath), "report.json")),
      "utf8",
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const report = JSON.parse(text).quality;
  if (report === undefined) return null;
  const summary = (value: GeometrySummary) =>
    value &&
    [value.vertices, value.triangles, value.meshes].every(
      (number) => Number.isSafeInteger(number) && number >= 0,
    ) &&
    [value.size, value.min, value.max].every(
      (vector) => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite),
    ) &&
    [value.hasUv, value.hasTextures, value.hasSkeleton].every((flag) => typeof flag === "boolean");
  if (
    !report ||
    !summary(report.before) ||
    !summary(report.after) ||
    ![report.losses, report.defects].every(
      (messages) =>
        Array.isArray(messages) && messages.every((message) => typeof message === "string"),
    ) ||
    typeof report.needsReview !== "boolean"
  )
    throw new Error("Повреждён отчёт структурной проверки модели");
  if (report.visual !== undefined) {
    const visual = report.visual;
    const score = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
    if (visual.status === "done") {
      if (
        !score(visual.score) ||
        visual.threshold !== 80 ||
        typeof visual.method !== "string" ||
        !Array.isArray(visual.views) ||
        visual.views.length !== 6 ||
        !visual.views.every(
          (view: { name: string; score: number | null; index: number }, index: number) =>
            view &&
            typeof view.name === "string" &&
            view.index === index &&
            (view.score === null || score(view.score)),
        )
      ) {
        throw new Error("Повреждён отчёт визуального сравнения");
      }
    } else if (visual.status !== "unavailable" || typeof visual.message !== "string") {
      throw new Error("Неверное состояние визуального сравнения");
    }
  }
  if (report.upscale !== undefined) {
    const upscale = report.upscale;
    const dimension = (value: unknown) =>
      typeof value === "number" && Number.isSafeInteger(value) && value > 0;
    if (
      !upscale ||
      typeof upscale.model !== "string" ||
      !Array.isArray(upscale.items) ||
      (upscale.message !== undefined && typeof upscale.message !== "string") ||
      !upscale.items.every(
        (item: UpscaleReport["items"][number]) =>
          item &&
          dimension(item.width) &&
          dimension(item.height) &&
          (item.status === "skipped"
            ? typeof item.reason === "string"
            : item.status === "done" &&
              item.outputWidth === item.width * 4 &&
              item.outputHeight === item.height * 4),
      )
    ) {
      throw new Error("Повреждён отчёт увеличения текстур");
    }
  }
  return report;
}
