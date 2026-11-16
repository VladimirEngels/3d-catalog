import { convertFile } from "../../../../converter/index.js";
import { readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

process.on("disconnect", () => process.exit(1));
process.once("message", async ({ inputPath, targetFormat, outputDirectory, resourceRoot }) => {
  try {
    const result = await convertFile(inputPath, targetFormat, outputDirectory, resourceRoot);
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
});
