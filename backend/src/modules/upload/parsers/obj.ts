
import { readFileSync } from "node:fs";
import { BoundingBox, ModelFileError, type FindFile, type FoundFile, type ParsedModel, type TextureSource } from "./types";

export function parseObj(data: Buffer, findFile: FindFile): ParsedModel {
  const box = new BoundingBox();
  let vertices = 0;
  let triangles = 0;
  const materialNames = new Set<string>();
  const materialFiles: string[] = [];

  for (const rawLine of data.toString("utf8").split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("v ")) {
      const parts = line.split(/\s+/);
      const [x, y, z] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new ModelFileError("В файле OBJ неверные координаты вершины");
      }
      box.add(x, y, z);
      vertices++;
    } else if (line.startsWith("f ")) {
      const corners = line.split(/\s+/).length - 1;
      if (corners >= 3) {
        triangles += corners - 2;
      }
    } else if (line.startsWith("usemtl ")) {
      materialNames.add(line.slice(7).trim());
    } else if (line.startsWith("mtllib ")) {
      materialFiles.push(line.slice(7).trim());
    }
  }

  const companions: FoundFile[] = [];
  const textures: TextureSource[] = [];
  for (const reference of materialFiles) {
    const file = findFile(reference);
    if (file) {
      companions.push(file);
      readMaterialFile(file, findFile, materialNames, textures);
    }
  }

  return {
    triangles,
    vertices,
    hasSkeleton: false,
    size: box.getSize(),
    materials: [...materialNames].filter((name) => name !== ""),
    textures,
    companions,
  };
}

function readMaterialFile(file: FoundFile, findFile: FindFile, names: Set<string>, textures: TextureSource[]): void {
  for (const rawLine of readFileSync(file.path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("newmtl ")) {
      names.add(line.slice(7).trim());
      continue;
    }
    const textureLine = line.match(/^(map_\w+|bump|disp|decal|norm)\s+(.+)$/i);
    if (textureLine) {
      const value = textureLine[2];
      const texture = findFile(value) ?? findFile(value.split(/\s+/).pop() ?? "");
      if (texture && !textures.some((t) => "path" in t && t.path === texture.path)) {
        textures.push({ name: texture.name, path: texture.path });
      }
    }
  }
}
