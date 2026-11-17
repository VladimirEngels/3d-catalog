import { convertFile } from "../../../../converter/index.js";
import { readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import { compareModelImages } from "../quality/render.js";
import { upscaleTextures } from "./upscale.js";

process.on("disconnect", () => process.exit(1));
process.once(
  "message",
  async ({ inputPath, targetFormat, outputDirectory, resourceRoot, upscale }) => {
    try {
      let upscaling;
      const processTextures = upscale
        ? async (geometries) => {
            const result = await upscaleTextures(
              geometries,
              join(dirname(outputDirectory), "textures"),
            );
            upscaling = result.report;
            return result.geometries;
          }
        : undefined;
      const result = await convertFile(
        inputPath,
        targetFormat,
        outputDirectory,
        resourceRoot,
        processTextures,
      );
      if (upscaling) result.quality.upscale = upscaling;
      result.quality.visual = await compareModelImages(
        inputPath,
        result.path,
        resourceRoot,
        join(dirname(outputDirectory), "images"),
      );
      result.quality.needsReview ||=
        result.quality.visual.status !== "done" || result.quality.visual.score < 80;
      const names = await readdir(outputDirectory);
      if (targetFormat === "OBJ" && names.length > 1) {
        const archive = new yazl.ZipFile();
        const path = join(dirname(outputDirectory), "result.zip");
        archive.on("error", (error) => archive.outputStream.destroy(error));
        const complete = pipeline(archive.outputStream, createWriteStream(path));
        for (const name of names) archive.addFile(join(outputDirectory, name), name);
        archive.end();
        await complete;
        result.path = path;
      }
      if ((await stat(result.path)).size > 500 * 1024 * 1024)
        throw new Error("Результат преобразования больше 500 МБ");
      process.send?.({ result }, () => process.disconnect());
    } catch (error) {
      const message =
        error.code === "ENOENT" ? "Не найден файл модели, материала или текстуры" : error.message;
      process.send?.({ error: String(message).slice(0, 2000) }, () => process.disconnect());
    }
  },
);
