
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";

export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? resolve(import.meta.dirname, "../storage");
}

export function absolutePath(relativePath: string): string {
  const root = storageRoot();
  const full = resolve(root, relativePath);
  if (!full.startsWith(root + sep)) {
    throw new Error("Неверный путь в хранилище");
  }
  return full;
}

export async function createVersionFolder(): Promise<string> {
  const folder = posix.join("models", randomUUID());
  await mkdir(absolutePath(folder), { recursive: true });
  return folder;
}

export async function removeFolder(relativeFolder: string): Promise<void> {
  await rm(absolutePath(relativeFolder), { recursive: true, force: true });
}

export async function removeFoldersOfFiles(relativePaths: string[]): Promise<void> {
  const folders = new Set(relativePaths.map((path) => dirname(path)));
  for (const folder of folders) {
    await removeFolder(folder);
  }
}
