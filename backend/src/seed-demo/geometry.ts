
import { crc32, deflateSync } from "node:zlib";

export interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function createMesh(): Mesh {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

type Vector = [number, number, number];

function addVertex(mesh: Mesh, position: Vector, normal: Vector, u: number, v: number): void {
  mesh.positions.push(...position);
  mesh.normals.push(...normal);
  mesh.uvs.push(u, v);
}

export function addBox(mesh: Mesh, center: Vector, size: Vector): void {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const faces: { normal: Vector; corners: Vector[] }[] = [
    { normal: [0, 0, 1], corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { normal: [0, 0, -1], corners: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { normal: [1, 0, 0], corners: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { normal: [-1, 0, 0], corners: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { normal: [0, 1, 0], corners: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { normal: [0, -1, 0], corners: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const face of faces) {
    const start = mesh.positions.length / 3;
    face.corners.forEach((corner, i) => {
      addVertex(mesh, [cx + corner[0], cy + corner[1], cz + corner[2]], face.normal, uv[i][0], uv[i][1]);
    });
    mesh.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

function addSurface(mesh: Mesh, columns: number, rows: number, point: (u: number, v: number) => Vector): void {
  const start = mesh.positions.length / 3;
  const step = 0.001;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const v = row / rows;
      const p = point(u, v);
      const pu = point(u + step, v);
      const pv = point(u, v + step);
      const a: Vector = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]];
      const b: Vector = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
      const n: Vector = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const length = Math.hypot(n[0], n[1], n[2]) || 1;
      addVertex(mesh, p, [n[0] / length, n[1] / length, n[2] / length], u, v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = start + row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      mesh.indices.push(a, c, b, b, c, d);
    }
  }
}

export function addSphere(mesh: Mesh, center: Vector, radius: number, segments = 32): void {
  addSurface(mesh, segments, Math.floor(segments / 2), (u, v) => {
    const around = u * Math.PI * 2;
    const up = v * Math.PI;
    return [
      center[0] + radius * Math.sin(up) * Math.cos(around),
      center[1] + radius * Math.cos(up),
      center[2] + radius * Math.sin(up) * Math.sin(around),
    ];
  });
}

export function addCylinder(mesh: Mesh, center: Vector, radiusTop: number, radiusBottom: number, height: number, segments = 32): void {
  addSurface(mesh, segments, 8, (u, v) => {
    const around = u * Math.PI * 2;
    const radius = radiusTop + (radiusBottom - radiusTop) * v;
    return [center[0] + radius * Math.cos(around), center[1] + height / 2 - height * v, center[2] + radius * Math.sin(around)];
  });
}

export function addTorus(mesh: Mesh, center: Vector, radius: number, tube: number, segments = 40): void {
  addSurface(mesh, segments, 16, (u, v) => {
    const around = u * Math.PI * 2;
    const inner = v * Math.PI * 2;
    return [
      center[0] + (radius + tube * Math.cos(inner)) * Math.cos(around),
      center[1] + (radius + tube * Math.cos(inner)) * Math.sin(around),
      center[2] + tube * Math.sin(inner),
    ];
  });
}


export function toObj(mesh: Mesh, materialFile?: string, materialName?: string): Buffer {
  const lines: string[] = [];
  if (materialFile) lines.push(`mtllib ${materialFile}`);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push(`v ${mesh.positions[i]} ${mesh.positions[i + 1]} ${mesh.positions[i + 2]}`);
  }
  for (let i = 0; i < mesh.uvs.length; i += 2) {
    lines.push(`vt ${mesh.uvs[i]} ${mesh.uvs[i + 1]}`);
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    lines.push(`vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}`);
  }
  if (materialName) lines.push(`usemtl ${materialName}`);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i] + 1, mesh.indices[i + 1] + 1, mesh.indices[i + 2] + 1];
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
  return Buffer.from(lines.join("\n") + "\n");
}

export function toStl(mesh: Mesh): Buffer {
  const triangles = mesh.indices.length / 3;
  const data = Buffer.alloc(84 + triangles * 50);
  data.writeUInt32LE(triangles, 80);
  for (let t = 0; t < triangles; t++) {
    const base = 84 + t * 50;
    const first = mesh.indices[t * 3];
    for (let axis = 0; axis < 3; axis++) {
      data.writeFloatLE(mesh.normals[first * 3 + axis], base + axis * 4);
    }
    for (let corner = 0; corner < 3; corner++) {
      const vertex = mesh.indices[t * 3 + corner];
      for (let axis = 0; axis < 3; axis++) {
        data.writeFloatLE(mesh.positions[vertex * 3 + axis], base + 12 + corner * 12 + axis * 4);
      }
    }
  }
  return data;
}

export function toPly(mesh: Mesh): Buffer {
  const vertexCount = mesh.positions.length / 3;
  const faceCount = mesh.indices.length / 3;
  const lines = [
    "ply", "format ascii 1.0", `element vertex ${vertexCount}`,
    "property float x", "property float y", "property float z",
    "property float nx", "property float ny", "property float nz",
    `element face ${faceCount}`, "property list uchar int vertex_indices", "end_header",
  ];
  for (let i = 0; i < vertexCount; i++) {
    const p = mesh.positions.slice(i * 3, i * 3 + 3);
    const n = mesh.normals.slice(i * 3, i * 3 + 3);
    lines.push([...p, ...n].join(" "));
  }
  for (let i = 0; i < faceCount; i++) {
    lines.push(`3 ${mesh.indices[i * 3]} ${mesh.indices[i * 3 + 1]} ${mesh.indices[i * 3 + 2]}`);
  }
  return Buffer.from(lines.join("\n") + "\n");
}

export function toGlb(mesh: Mesh, options: { texture?: Buffer; skeleton?: boolean; materialName?: string }): Buffer {
  const vertexCount = mesh.positions.length / 3;
  const chunks: Buffer[] = [];
  const bufferViews: object[] = [];
  let offset = 0;

  function addView(data: Buffer, target?: number): number {
    const padding = (4 - (data.length % 4)) % 4;
    chunks.push(data, Buffer.alloc(padding));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) });
    offset += data.length + padding;
    return bufferViews.length - 1;
  }

  const floats = (values: number[]) => Buffer.from(new Float32Array(values).buffer);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], mesh.positions[i]);
    max[i % 3] = Math.max(max[i % 3], mesh.positions[i]);
  }

  const accessors: object[] = [
    { bufferView: addView(floats(mesh.positions), 34962), componentType: 5126, count: vertexCount, type: "VEC3", min, max },
    { bufferView: addView(floats(mesh.normals), 34962), componentType: 5126, count: vertexCount, type: "VEC3" },
    { bufferView: addView(floats(mesh.uvs.map((value, i) => (i % 2 === 1 ? 1 - value : value))), 34962), componentType: 5126, count: vertexCount, type: "VEC2" },
    { bufferView: addView(Buffer.from(new Uint32Array(mesh.indices).buffer), 34963), componentType: 5125, count: mesh.indices.length, type: "SCALAR" },
  ];
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 };

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "3D-Каталог: демонстрационные данные" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Модель" }],
    meshes: [{ primitives: [{ attributes, indices: 3, material: 0 }] }],
    materials: [{ name: options.materialName ?? "Материал", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } }],
  };

  if (options.skeleton) {
    const joints = Buffer.alloc(vertexCount * 4);
    const weights = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
      weights[i * 4] = 1;
    }
    attributes.JOINTS_0 = accessors.push({ bufferView: addView(joints, 34962), componentType: 5121, count: vertexCount, type: "VEC4" }) - 1;
    attributes.WEIGHTS_0 = accessors.push({ bufferView: addView(Buffer.from(weights.buffer), 34962), componentType: 5126, count: vertexCount, type: "VEC4" }) - 1;
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const inverseBind = accessors.push({ bufferView: addView(floats(identity)), componentType: 5126, count: 1, type: "MAT4" }) - 1;
    json.nodes = [{ mesh: 0, skin: 0, name: "Модель" }, { name: "Кость" }];
    json.scenes = [{ nodes: [0, 1] }];
    json.skins = [{ joints: [1], inverseBindMatrices: inverseBind }];
  }

  if (options.texture) {
    const imageView = addView(options.texture);
    json.images = [{ name: "текстура", bufferView: imageView, mimeType: "image/png" }];
    json.textures = [{ source: 0 }];
    (json.materials as { pbrMetallicRoughness: object }[])[0].pbrMetallicRoughness = {
      baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8,
    };
  }

  json.accessors = accessors;
  json.bufferViews = bufferViews;
  const binary = Buffer.concat(chunks);
  json.buffers = [{ byteLength: binary.length }];

  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0);
  jsonHeader.write("JSON", 4, "latin1");
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.write("BIN\0", 4, "latin1");
  return Buffer.concat([header, jsonHeader, jsonBytes, binaryHeader, binary]);
}


export function createPng(size: number, color: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const line = y * (size * 3 + 1);
    raw[line] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = color(x / size, y / size);
      raw[line + 1 + x * 3] = r;
      raw[line + 2 + x * 3] = g;
      raw[line + 3 + x * 3] = b;
    }
  }

  function chunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
