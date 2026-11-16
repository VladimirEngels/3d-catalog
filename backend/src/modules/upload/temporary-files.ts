import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const root = resolve(tmpdir(), "3d-katalog-uploads");
await mkdir(root, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  const match = /^(\d+)-[a-zA-Z0-9]+$/.exec(entry.name);
  if (!entry.isDirectory() || !match) continue;
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) continue;
  try {
    process.kill(pid, 0);
    continue;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") continue;
  }
  const folder = resolve(root, entry.name);
  if (!folder.startsWith(root + sep)) throw new Error("Неверный путь временной папки");
  await rm(folder, { recursive: true, force: true });
}

export const uploadTempFolder = await mkdtemp(join(root, `${process.pid}-`));
