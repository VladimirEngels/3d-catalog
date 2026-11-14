
import { BoundingBox, ModelFileError, type ParsedModel } from "./types";

const HEADER_SIZE = 84;
const TRIANGLE_SIZE = 50;

export function parseStl(data: Buffer): ParsedModel {
  return isBinaryStl(data) ? parseBinary(data) : parseText(data);
}

function isBinaryStl(data: Buffer): boolean {
  if (data.length < HEADER_SIZE) {
    return false;
  }
  return data.length === HEADER_SIZE + data.readUInt32LE(80) * TRIANGLE_SIZE;
}

function parseBinary(data: Buffer): ParsedModel {
  const triangles = data.readUInt32LE(80);
  const box = new BoundingBox();
  const uniqueVertices = new Set<string>();

  for (let i = 0; i < triangles; i++) {
    const start = HEADER_SIZE + i * TRIANGLE_SIZE + 12;
    for (let corner = 0; corner < 3; corner++) {
      const position = start + corner * 12;
      box.add(data.readFloatLE(position), data.readFloatLE(position + 4), data.readFloatLE(position + 8));
      uniqueVertices.add(data.toString("latin1", position, position + 12));
    }
  }
  return buildResult(triangles, uniqueVertices.size, box);
}

function parseText(data: Buffer): ParsedModel {
  const box = new BoundingBox();
  const uniqueVertices = new Set<string>();
  let vertexLines = 0;

  for (const line of data.toString("latin1").split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "vertex") {
      const [x, y, z] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new ModelFileError("В файле STL неверные координаты вершины");
      }
      box.add(x, y, z);
      uniqueVertices.add(`${parts[1]} ${parts[2]} ${parts[3]}`);
      vertexLines++;
    }
  }
  return buildResult(Math.floor(vertexLines / 3), uniqueVertices.size, box);
}

function buildResult(triangles: number, vertices: number, box: BoundingBox): ParsedModel {
  return { triangles, vertices, hasSkeleton: false, size: box.getSize(), materials: [], textures: [], companions: [] };
}
