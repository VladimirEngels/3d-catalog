import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";

export async function createResourceReader(
  inputPath,
  remainingBytes,
  resourceRoot = dirname(resolve(inputPath)),
) {
  const root = await realpath(resourceRoot);
  const cache = new Map();
  const sourcePath = await realpath(inputPath);
  const inside = (path) => {
    const prefix = root.endsWith(sep) ? root : root + sep;
    return process.platform === "win32"
      ? path.toLowerCase().startsWith(prefix.toLowerCase())
      : path.startsWith(prefix);
  };
  if (!inside(sourcePath)) throw new Error("Модель находится вне указанной папки ресурсов");
  return async (reference, relativeTo = sourcePath) => {
    let name = reference;
    try {
      name = decodeURIComponent(name);
    } catch {}
    name = name.replace(/\\/g, "/");
    if (!name || name.includes("\0") || isAbsolute(name) || /^[a-z][a-z0-9+.-]*:/i.test(name))
      throw new Error("Ссылка на файл должна быть относительной");
    const candidate = resolve(dirname(resolve(relativeTo)), name);
    if (!inside(candidate)) throw new Error("Связанный файл находится вне папки модели");
    const path = await realpath(candidate);
    if (!inside(path)) throw new Error("Связанный файл находится вне папки модели");
    const key = process.platform === "win32" ? path.toLowerCase() : path;
    if (cache.has(key)) return cache.get(key);
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Ожидался файл материала или текстуры");
    if (info.size > remainingBytes)
      throw new Error("Модель вместе с материалами и текстурами больше 100 МБ");
    const bytes = await readFile(path);
    if (bytes.length > remainingBytes)
      throw new Error("Модель вместе с материалами и текстурами больше 100 МБ");
    remainingBytes -= bytes.length;
    const result = { path, bytes };
    cache.set(key, result);
    return result;
  };
}
