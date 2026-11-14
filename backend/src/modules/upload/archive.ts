
import { createWriteStream } from "node:fs";
import { posix, join } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { AppError } from "../../errors";
import type { FindFile, FoundFile } from "./parsers/types";

export type ModelFormat = "OBJ" | "STL" | "PLY" | "GLTF" | "GLB";

const FORMATS: Record<string, ModelFormat> = { obj: "OBJ", stl: "STL", ply: "PLY", gltf: "GLTF", glb: "GLB" };

const MAX_ARCHIVE_FILES = 1000;
const MAX_UNPACKED_BYTES = 500 * 1024 * 1024;

export interface ModelSource {
  fileName: string;
  path: string;
  format: ModelFormat;
  findFile: FindFile;
}

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export async function prepareSource(fileName: string, filePath: string, workFolder: string): Promise<ModelSource> {
  const extension = getExtension(fileName);

  if (extension === "zip") {
    return prepareArchive(filePath, workFolder);
  }
  if (FORMATS[extension]) {
    return { fileName, path: filePath, format: FORMATS[extension], findFile: () => undefined };
  }
  throw new AppError(400, "Этот формат не поддерживается. Подойдут OBJ, STL, PLY, glTF, GLB или ZIP");
}

async function prepareArchive(archivePath: string, workFolder: string): Promise<ModelSource> {
  const files = await extractArchive(archivePath, workFolder);

  const modelFiles = files.filter((file) => FORMATS[getExtension(file.name)]);
  if (modelFiles.length === 0) {
    throw new AppError(400, "В архиве нет файла модели: OBJ, STL, PLY, glTF или GLB");
  }
  if (modelFiles.length > 1) {
    throw new AppError(400, "В архиве должна быть одна модель, а найдено несколько");
  }

  const main = modelFiles[0];
  return {
    fileName: main.name,
    path: main.path,
    format: FORMATS[getExtension(main.name)],
    findFile: createFileFinder(files, posix.dirname(main.name)),
  };
}

function extractArchive(archivePath: string, workFolder: string): Promise<FoundFile[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (openError, zip) => {
      if (openError) {
        reject(new AppError(400, "Не удалось открыть архив: он повреждён или это не ZIP"));
        return;
      }

      const files: FoundFile[] = [];
      let unpackedBytes = 0;

      function fail(message: string): void {
        zip.close();
        reject(new AppError(400, message));
      }

      zip.on("error", () => fail("Архив повреждён"));
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry: yauzl.Entry) => {
        const isFolder = entry.fileName.endsWith("/");
        const isSystem = entry.fileName.startsWith("__MACOSX/");
        if (isFolder || isSystem) {
          zip.readEntry();
          return;
        }

        unpackedBytes += entry.uncompressedSize;
        if (files.length >= MAX_ARCHIVE_FILES || unpackedBytes > MAX_UNPACKED_BYTES) {
          fail("Архив слишком большой после распаковки");
          return;
        }

        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail("Не удалось прочитать файл из архива");
            return;
          }
          const path = join(workFolder, `unpacked-${files.length}`);
          pipeline(stream, createWriteStream(path)).then(
            () => {
              files.push({ name: entry.fileName, path });
              zip.readEntry();
            },
            () => fail("Не удалось распаковать файл из архива"),
          );
        });
      });

      zip.readEntry();
    });
  });
}

function createFileFinder(files: FoundFile[], mainFolder: string): FindFile {
  const normalize = (name: string) => posix.normalize(name.replace(/\\/g, "/")).toLowerCase();
  const byFullName = new Map(files.map((file) => [normalize(file.name), file]));

  return (reference) => {
    let clean = reference;
    try {
      clean = decodeURIComponent(reference);
    } catch {
    }
    const normalized = normalize(clean);
    const baseName = posix.basename(normalized);
    return (
      byFullName.get(normalize(posix.join(mainFolder, clean.replace(/\\/g, "/")))) ??
      byFullName.get(normalized) ??
      files.find((file) => normalize(posix.basename(file.name)) === baseName)
    );
  };
}
