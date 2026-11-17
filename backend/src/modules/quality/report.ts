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
}

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
  return report;
}
