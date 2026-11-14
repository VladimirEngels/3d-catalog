
import { readFileSync } from "node:fs";
import { BoundingBox, ModelFileError, type FindFile, type FoundFile, type ParsedModel, type TextureSource } from "./types";

type Matrix = number[];

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const MAX_NODE_VISITS = 100000;

export function parseGltf(data: Buffer, isBinary: boolean, findFile: FindFile): ParsedModel {
  const { json, binaryChunk } = isBinary ? readGlb(data) : { json: JSON.parse(data.toString("utf8")), binaryChunk: undefined };

  if (typeof json.asset?.version !== "string" || !json.asset.version.startsWith("2")) {
    throw new ModelFileError("Поддерживается только glTF версии 2");
  }

  const companions: FoundFile[] = [];
  const buffers = loadBuffers(json, binaryChunk, findFile, companions);
  const stats = countGeometry(json);

  return {
    triangles: stats.triangles,
    vertices: stats.vertices,
    hasSkeleton: (json.skins ?? []).length > 0,
    size: stats.box.getSize(),
    materials: (json.materials ?? []).map((material: any, index: number) => material.name || `Материал ${index + 1}`),
    textures: readImages(json, buffers, findFile),
    companions,
  };
}

function readGlb(data: Buffer): { json: any; binaryChunk: Buffer | undefined } {
  if (data.toString("latin1", 0, 4) !== "glTF") {
    throw new ModelFileError("Файл не похож на GLB: нет подписи glTF");
  }
  if (data.readUInt32LE(4) !== 2) {
    throw new ModelFileError("Поддерживается только GLB версии 2");
  }

  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.toString("utf8", 20, 20 + jsonLength));

  let binaryChunk: Buffer | undefined;
  const nextChunk = 20 + jsonLength;
  if (nextChunk + 8 <= data.length) {
    const binaryLength = data.readUInt32LE(nextChunk);
    binaryChunk = data.subarray(nextChunk + 8, nextChunk + 8 + binaryLength);
  }
  return { json, binaryChunk };
}

function loadBuffers(json: any, binaryChunk: Buffer | undefined, findFile: FindFile, companions: FoundFile[]): (Buffer | undefined)[] {
  return (json.buffers ?? []).map((buffer: any) => {
    if (buffer.uri === undefined) {
      return binaryChunk;
    }
    if (buffer.uri.startsWith("data:")) {
      return decodeDataUri(buffer.uri);
    }
    const file = findFile(buffer.uri);
    if (!file) {
      return undefined;
    }
    companions.push(file);
    return readFileSync(file.path);
  });
}

function decodeDataUri(uri: string): Buffer {
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

function countGeometry(json: any): { triangles: number; vertices: number; box: BoundingBox } {
  const box = new BoundingBox();
  let triangles = 0;
  let vertices = 0;
  let visits = 0;

  function addMesh(meshIndex: number, matrix: Matrix): void {
    for (const primitive of json.meshes[meshIndex].primitives) {
      const position = json.accessors[primitive.attributes.POSITION];
      vertices += position.count;
      triangles += countPrimitiveTriangles(primitive, position, json);
      addAccessorBounds(position, matrix, box);
    }
  }

  function visitNode(nodeIndex: number, parentMatrix: Matrix): void {
    visits++;
    if (visits > MAX_NODE_VISITS) {
      throw new ModelFileError("Неверная структура сцены в файле glTF");
    }
    const node = json.nodes[nodeIndex];
    const matrix = multiply(parentMatrix, getNodeMatrix(node));
    if (node.mesh !== undefined) {
      addMesh(node.mesh, matrix);
    }
    for (const child of node.children ?? []) {
      visitNode(child, matrix);
    }
  }

  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) {
    for (const nodeIndex of scene.nodes ?? []) {
      visitNode(nodeIndex, IDENTITY);
    }
  } else {
    (json.meshes ?? []).forEach((_mesh: any, index: number) => addMesh(index, IDENTITY));
  }

  return { triangles, vertices, box };
}

function countPrimitiveTriangles(primitive: any, position: any, json: any): number {
  const indexCount = primitive.indices !== undefined ? json.accessors[primitive.indices].count : position.count;
  const mode = primitive.mode ?? 4;
  if (mode === 4) {
    return Math.floor(indexCount / 3);
  }
  if (mode === 5 || mode === 6) {
    return Math.max(0, indexCount - 2);
  }
  return 0;
}

function addAccessorBounds(position: any, matrix: Matrix, box: BoundingBox): void {
  const [minX, minY, minZ] = position.min;
  const [maxX, maxY, maxZ] = position.max;
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) {
        box.add(
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        );
      }
    }
  }
}

function getNodeMatrix(node: any): Matrix {
  if (node.matrix) {
    return node.matrix;
  }
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }
  return result;
}

function readImages(json: any, buffers: (Buffer | undefined)[], findFile: FindFile): TextureSource[] {
  const textures: TextureSource[] = [];

  (json.images ?? []).forEach((image: any, index: number) => {
    const name: string = image.name || `image_${index + 1}`;

    if (image.bufferView !== undefined) {
      const view = json.bufferViews[image.bufferView];
      const buffer = buffers[view.buffer];
      if (buffer) {
        const start = view.byteOffset ?? 0;
        textures.push({ name, bytes: buffer.subarray(start, start + view.byteLength) });
      }
    } else if (image.uri?.startsWith("data:")) {
      textures.push({ name, bytes: decodeDataUri(image.uri) });
    } else if (image.uri) {
      const file = findFile(image.uri);
      if (file) {
        textures.push({ name: file.name, path: file.path });
      }
    }
  });

  return textures;
}
