
import { readFile } from "node:fs/promises";
import { AppError } from "../../errors";
import type { ModelSource } from "./archive";
import { parseGltf } from "./parsers/gltf";
import { parseObj } from "./parsers/obj";
import { parsePly } from "./parsers/ply";
import { parseStl } from "./parsers/stl";
import { ModelFileError, type ParsedModel } from "./parsers/types";

const MAX_DATABASE_INTEGER = 2147483647;

export async function parseModel(source: ModelSource): Promise<ParsedModel> {
  let parsed: ParsedModel;
  try {
    const data = await readFile(source.path);
    parsed = parseByFormat(data, source);
  } catch (error) {
    if (error instanceof ModelFileError) {
      throw new AppError(400, error.message);
    }
    throw new AppError(400, `Не удалось прочитать файл ${source.format}: он повреждён или имеет неверный формат`);
  }

  checkResult(parsed);
  return parsed;
}

function parseByFormat(data: Buffer, source: ModelSource): ParsedModel {
  switch (source.format) {
    case "STL": return parseStl(data);
    case "OBJ": return parseObj(data, source.findFile);
    case "PLY": return parsePly(data);
    case "GLTF": return parseGltf(data, false, source.findFile);
    case "GLB": return parseGltf(data, true, source.findFile);
  }
}

function checkResult(parsed: ParsedModel): void {
  if (parsed.vertices === 0) {
    throw new AppError(400, "В файле нет геометрии: не найдено ни одной вершины");
  }
  const sizeIsValid = parsed.size.every((value) => Number.isFinite(value) && value >= 0);
  if (!sizeIsValid || parsed.triangles > MAX_DATABASE_INTEGER || parsed.vertices > MAX_DATABASE_INTEGER) {
    throw new AppError(400, "Файл содержит неверные данные: не удалось определить размеры модели");
  }
}
