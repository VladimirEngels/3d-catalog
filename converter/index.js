import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { readObj } from "./readers/obj.js";
import { writeModel as writeObj } from "./writers/obj.js";
import { writeGlb } from "./writers/glb.js";
import { createResourceReader } from "./readers/files.js";
import { loadObjMaterials } from "./readers/mtl.js";
import { readGltf } from "./readers/gltf.js";
import { bakeSkin } from "./core/matrix.js";
import { summarizeGeometry, compareGeometry } from "./core/quality.js";

export { readObj, writeObj, writeGlb };

export async function convertFile(
  inputPath,
  targetFormat,
  outputDirectory,
  resourceRoot = dirname(inputPath),
) {
  const format = typeof targetFormat === "string" ? targetFormat.toUpperCase() : "";
  const readers = {
    ".obj": readObj,
    ".glb": readGltf,
  };
  const writers = { OBJ: writeObj, GLB: writeGlb };
  const reader = Object.hasOwn(readers, extname(inputPath).toLowerCase())
    ? readers[extname(inputPath).toLowerCase()]
    : null;
  if (!reader) throw new Error("Поддерживается чтение только OBJ и GLB");
  if (!Object.hasOwn(writers, format)) throw new Error("Выберите целевой формат OBJ или GLB");
  const maxBytes = 100 * 1024 * 1024;
  if ((await stat(inputPath)).size > maxBytes) throw new Error("Файл больше 100 МБ");
  const data = await readFile(inputPath);
  if (data.length > maxBytes) throw new Error("Файл больше 100 МБ");
  let source =
    reader === readGltf
      ? await readGltf(
          data,
          await createResourceReader(inputPath, maxBytes - data.length, resourceRoot),
          extname(inputPath).toLowerCase() === ".glb",
        )
      : reader(data);
  if (
    reader === readObj &&
    (source.materialLibraries.length || source.geometries.some((geo) => geo.materialName))
  ) {
    source = await loadObjMaterials(
      source,
      await createResourceReader(inputPath, maxBytes - data.length, resourceRoot),
    );
  }
  const { losses } = source;
  const before = summarizeGeometry(source.geometries);
  let { geometries } = source;
  if (format !== "GLB") {
    if (geometries.some((geo) => geo.skin))
      losses.push("Скелет не сохраняется; в результат записана статическая поза");
    if (
      geometries.some(
        (geo) =>
          geo.pbr ||
          geo.normalMapBuf ||
          geo.metallicRoughnessBuf ||
          geo.emissiveBuf ||
          geo.occlusionBuf,
      )
    )
      losses.push(
        "Расширенные свойства PBR и дополнительные карты не переносятся в целевой формат",
      );
    if (geometries.some((geo) => geo.colors))
      losses.push("Цвета отдельных вершин не переносятся в целевой формат");
    if (geometries.some((geo) => geo.tangents))
      losses.push("Касательные не переносятся в целевой формат");
    geometries = geometries.map((geo) => {
      const result = geo.skin ? bakeSkin(geo) : geo;
      return result.pbr?.alphaMode === "OPAQUE" ? { ...result, transparency: 0 } : result;
    });
  }
  await mkdir(dirname(outputDirectory), { recursive: true });
  await mkdir(outputDirectory);
  const result =
    format === "OBJ"
      ? await writeObj(geometries, outputDirectory)
      : await writers[format](geometries, join(outputDirectory, `model.${format.toLowerCase()}`));
  const path = result.objPath ?? result.path;
  const written = await readFile(path);
  let restored;
  if (format === "GLB") {
    restored = await readGltf(written, await createResourceReader(path, 0, outputDirectory), true);
  } else {
    restored = await loadObjMaterials(
      readObj(written),
      await createResourceReader(path, 500 * 1024 * 1024, outputDirectory),
    );
  }
  const quality = compareGeometry(before, summarizeGeometry(restored.geometries), [
    ...new Set(losses),
  ]);
  return { format, path, losses: quality.losses, quality };
}
