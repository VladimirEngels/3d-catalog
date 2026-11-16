import { matMul, matInvert, toColumnMajor, boneMatrix } from "../core/matrix.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prepareGeometries } from "../core/geometry.js";
import { pbrFor } from "../core/materials.js";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const FLOAT = 5126;
const USHORT = 5123;
const UINT = 5125;

function alignTo4(n) {
  return (n + 3) & ~3;
}

function buildPrimitive(geo, state) {
  const vCount = geo.vertices.length;
  const useShort = vCount <= 65535;

  const pos = Buffer.alloc(vCount * 12);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vCount; i++) {
    const v = geo.vertices[i];
    for (let a = 0; a < 3; a++) {
      const c = v[a];
      pos.writeFloatLE(c, i * 12 + a * 4);
      if (c < min[a]) min[a] = c;
      if (c > max[a]) max[a] = c;
    }
  }

  const needUV = !!geo.uvs?.length;
  const uv = needUV ? Buffer.alloc(vCount * 8) : null;
  if (needUV) {
    for (let i = 0; i < vCount; i++) {
      const t = geo.uvs[i];
      uv.writeFloatLE(t[0], i * 8);
      uv.writeFloatLE(t[1], i * 8 + 4);
    }
  }

  let nrm = null;
  if (geo.normals && geo.normals.length === vCount) {
    nrm = Buffer.alloc(vCount * 12);
    for (let i = 0; i < vCount; i++) {
      const n = geo.normals[i];
      for (let a = 0; a < 3; a++) nrm.writeFloatLE(n[a], i * 12 + a * 4);
    }
  }

  const fCount = geo.faces.length;
  const idx = Buffer.alloc(fCount * 3 * (useShort ? 2 : 4));
  for (const [index, f] of geo.faces.entries()) {
    const a = f[0] - 1;
    const b = f[1] - 1;
    const c = f[2] - 1;
    const off = index * 3 * (useShort ? 2 : 4);
    if (useShort) {
      idx.writeUInt16LE(a, off);
      idx.writeUInt16LE(b, off + 2);
      idx.writeUInt16LE(c, off + 4);
    } else {
      idx.writeUInt32LE(a, off);
      idx.writeUInt32LE(b, off + 4);
      idx.writeUInt32LE(c, off + 8);
    }
  }

  const { addView, addAccessor } = state;

  const attributes = {
    POSITION: addAccessor(addView(pos, 34962), "VEC3", FLOAT, vCount, { min, max }),
  };
  if (needUV) attributes.TEXCOORD_0 = addAccessor(addView(uv, 34962), "VEC2", FLOAT, vCount);
  if (nrm) attributes.NORMAL = addAccessor(addView(nrm, 34962), "VEC3", FLOAT, vCount);
  for (const [field, name] of [
    ["colors", "COLOR_0"],
    ["tangents", "TANGENT"],
  ])
    if (geo[field]) {
      const bytes = Buffer.alloc(vCount * 16);
      geo[field].forEach((values, i) =>
        values.forEach((value, k) => bytes.writeFloatLE(value, i * 16 + k * 4)),
      );
      attributes[name] = addAccessor(addView(bytes, 34962), "VEC4", FLOAT, vCount);
    }

  if (geo.skin && geo.skin.joints.length === vCount) {
    const jb = Buffer.alloc(vCount * 8);
    const wb = Buffer.alloc(vCount * 16);
    const nBones = geo.skin.bones.length;
    for (let i = 0; i < vCount; i++) {
      const j = geo.skin.joints[i];
      const w = geo.skin.weights[i];
      for (let k = 0; k < 4; k++) {
        jb.writeUInt16LE(w[k] > 0 ? Math.min(j[k], nBones - 1) : 0, i * 8 + k * 2);
        wb.writeFloatLE(w[k], i * 16 + k * 4);
      }
    }
    attributes.JOINTS_0 = addAccessor(addView(jb, 34962), "VEC4", USHORT, vCount);
    attributes.WEIGHTS_0 = addAccessor(addView(wb, 34962), "VEC4", FLOAT, vCount);
  }
  const indices = addAccessor(addView(idx, 34963), "SCALAR", useShort ? USHORT : UINT, fCount * 3);

  return { attributes, indices };
}

function materialFor(geo, state) {
  const alpha = 1 - Math.min(Math.max(geo.transparency ?? 0, 0), 1);
  const base = geo.textureBuf ? { r: 1, g: 1, b: 1 } : (geo.color ?? { r: 0.7, g: 0.7, b: 0.7 });
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const vc = geo.vertexColor;
  const color = vc
    ? { r: clamp01(base.r * vc.r), g: clamp01(base.g * vc.g), b: clamp01(base.b * vc.b) }
    : { r: clamp01(base.r), g: clamp01(base.g), b: clamp01(base.b) };

  const addTexture = (buf, field) => {
    if (!buf) return null;
    const imageKey = crypto.createHash("sha1").update(buf).digest("hex");
    if (!state.images.has(imageKey)) {
      const off = state.binLength;
      state.chunks.push(buf);
      state.binLength += buf.length;
      const pad = alignTo4(state.binLength) - state.binLength;
      if (pad) {
        state.chunks.push(Buffer.alloc(pad));
        state.binLength += pad;
      }
      state.json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
      state.json.images.push({
        bufferView: state.json.bufferViews.length - 1,
        mimeType: buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png",
      });
      state.images.set(imageKey, state.json.images.length - 1);
    }
    const settings = geo.textureSamplers?.[field] ?? {
      magFilter: 9729,
      minFilter: 9987,
      wrapS: 10497,
      wrapT: 10497,
    };
    const samplerKey = JSON.stringify(settings);
    if (!state.samplers.has(samplerKey)) {
      state.json.samplers.push(settings);
      state.samplers.set(samplerKey, state.json.samplers.length - 1);
    }
    const imageIndex = state.images.get(imageKey);
    const samplerIndex = state.samplers.get(samplerKey);
    const key = `${imageIndex}/${samplerIndex}`;
    if (!state.textures.has(key)) {
      state.json.textures.push({ source: imageIndex, sampler: samplerIndex });
      state.textures.set(key, state.json.textures.length - 1);
    }
    return state.textures.get(key);
  };

  const texIndex = addTexture(geo.textureBuf, "textureBuf");
  const normalIndex = addTexture(geo.normalMapBuf, "normalMapBuf");
  const metallicIndex = addTexture(geo.metallicRoughnessBuf, "metallicRoughnessBuf");
  const emissiveIndex = addTexture(geo.emissiveBuf, "emissiveBuf");
  const occlusionIndex = addTexture(geo.occlusionBuf, "occlusionBuf");

  const m = pbrFor(geo.material);
  const matKey = JSON.stringify([
    texIndex,
    normalIndex,
    metallicIndex,
    emissiveIndex,
    occlusionIndex,
    color.r,
    color.g,
    color.b,
    alpha,
    m.rough,
    m.metal,
    m.emissive,
    geo.pbr,
  ]);
  if (state.materials.has(matKey)) return state.materials.get(matKey);

  const pbr = {
    baseColorFactor: [color.r, color.g, color.b, alpha],
    metallicFactor: geo.pbr?.metallicFactor ?? m.metal,
    roughnessFactor: geo.pbr?.roughnessFactor ?? m.rough,
  };
  if (texIndex !== null) pbr.baseColorTexture = { index: texIndex };
  if (metallicIndex !== null) pbr.metallicRoughnessTexture = { index: metallicIndex };

  state.json.materials.push({
    pbrMetallicRoughness: pbr,
    doubleSided: geo.pbr?.doubleSided ?? true,
    ...(m.emissive > 0
      ? { emissiveFactor: [color.r * m.emissive, color.g * m.emissive, color.b * m.emissive] }
      : {}),
    ...(geo.pbr?.emissiveFactor ? { emissiveFactor: geo.pbr.emissiveFactor } : {}),
    ...(emissiveIndex !== null ? { emissiveTexture: { index: emissiveIndex } } : {}),
    ...(occlusionIndex !== null
      ? { occlusionTexture: { index: occlusionIndex, strength: geo.pbr?.occlusionStrength ?? 1 } }
      : {}),
    ...(normalIndex !== null
      ? { normalTexture: { index: normalIndex, scale: geo.pbr?.normalScale ?? 1 } }
      : {}),
    ...(geo.pbr
      ? { alphaMode: geo.pbr.alphaMode, alphaCutoff: geo.pbr.alphaCutoff }
      : alpha < 1
        ? { alphaMode: "BLEND" }
        : {}),
  });
  const id = state.json.materials.length - 1;
  state.materials.set(matKey, id);
  return id;
}

function buildSkin(geo, state) {
  const { bones, joints, weights } = geo.skin;
  const vCount = geo.vertices.length;
  if (!bones.length || joints.length !== vCount) return null;

  const toWorld = geo.instanceMatrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const world = bones.map((b) => matMul(toWorld, boneMatrix(b)));

  const firstNode = state.json.nodes.length;
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i].parent;
    let local = world[i];
    if (p >= 0) {
      const pInv = matInvert(world[p]);
      if (!pInv) throw new Error("Необратимая матрица родительской кости");
      local = matMul(pInv, world[i]);
    }
    state.json.nodes.push({
      name: bones[i].name || `bone_${i}`,
      matrix: toColumnMajor(local),
      children: [],
    });
  }
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i].parent;
    if (p >= 0) state.json.nodes[firstNode + p].children.push(firstNode + i);
  }
  for (const n of state.json.nodes.slice(firstNode)) if (!n.children.length) delete n.children;

  const ibm = Buffer.alloc(bones.length * 64);
  for (let i = 0; i < bones.length; i++) {
    const inv = geo.skin.inverseBindMatrices?.[i] ?? matInvert(world[i]);
    if (!inv) throw new Error("Необратимая матрица кости");
    const col = toColumnMajor(inv);
    for (let k = 0; k < 16; k++) ibm.writeFloatLE(col[k], i * 64 + k * 4);
  }

  const roots = bones.flatMap((bone, i) => (bone.parent < 0 ? [firstNode + i] : []));
  state.json.skins.push({
    joints: bones.map((_, i) => firstNode + i),
    ...(roots.length === 1 ? { skeleton: roots[0] } : {}),
    inverseBindMatrices: state.addAccessor(state.addView(ibm), "MAT4", FLOAT, bones.length),
  });
  return { skin: state.json.skins.length - 1, boneRoots: roots };
}

async function writeGlb(geometries, filePath) {
  geometries = prepareGeometries(geometries);

  const state = {
    json: {
      asset: { version: "2.0", generator: "3D Catalog Converter" },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      textures: [],
      images: [],
      skins: [],
      samplers: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    },
    chunks: [],
    binLength: 0,
    materials: new Map(),
    textures: new Map(),
    images: new Map(),
    samplers: new Map(),
  };

  state.addView = (buf, target) => {
    const off = state.binLength;
    state.chunks.push(buf);
    state.binLength += buf.length;
    const pad = alignTo4(state.binLength) - state.binLength;
    if (pad) {
      state.chunks.push(Buffer.alloc(pad));
      state.binLength += pad;
    }
    state.json.bufferViews.push({
      buffer: 0,
      byteOffset: off,
      byteLength: buf.length,
      ...(target ? { target } : {}),
    });
    return state.json.bufferViews.length - 1;
  };
  state.addAccessor = (view, type, componentType, count, extra = {}) => {
    state.json.accessors.push({ bufferView: view, componentType, count, type, ...extra });
    return state.json.accessors.length - 1;
  };

  let skinned = 0;
  for (let i = 0; i < geometries.length; i++) {
    const geo = geometries[i];
    const prim = buildPrimitive(geo, state);
    if (!prim) continue;
    prim.material = materialFor(geo, state);
    state.json.meshes.push({ primitives: [prim] });
    const meshIndex = state.json.meshes.length - 1;

    const built = geo.skin ? buildSkin(geo, state) : null;
    if (built) {
      state.json.nodes.push({
        mesh: meshIndex,
        skin: built.skin,
        name: `mesh_${geo.meshId ?? i}_${i}`,
      });
      state.json.scenes[0].nodes.push(state.json.nodes.length - 1);
      state.json.scenes[0].nodes.push(...built.boneRoots);
      skinned++;
    } else {
      state.json.nodes.push({ mesh: meshIndex, name: `mesh_${geo.meshId ?? i}_${i}` });
      state.json.scenes[0].nodes.push(state.json.nodes.length - 1);
    }
  }
  if (!state.json.meshes.length) throw new Error("нет геометрии для GLB");
  if (skinned) console.log(`[gltf] скелетов: ${skinned}`);

  state.json.buffers.push({ byteLength: state.binLength });
  for (const k of ["materials", "textures", "images", "samplers", "skins"]) {
    if (state.json[k].length === 0) delete state.json[k];
  }

  const jsonBuf = Buffer.from(JSON.stringify(state.json), "utf8");
  const jsonPad = alignTo4(jsonBuf.length) - jsonBuf.length;
  const jsonLen = jsonBuf.length + jsonPad;
  const total = 12 + 8 + jsonLen + 8 + state.binLength;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonLen, 0);
  jsonHdr.writeUInt32LE(JSON_CHUNK, 4);

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(state.binLength, 0);
  binHdr.writeUInt32LE(BIN_CHUNK, 4);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await pipeline(
    Readable.from([
      header,
      jsonHdr,
      jsonBuf,
      ...(jsonPad ? [Buffer.alloc(jsonPad, 0x20)] : []),
      binHdr,
      ...state.chunks,
    ]),
    fs.createWriteStream(filePath),
  );

  return {
    path: filePath,
    bytes: total,
    meshes: state.json.meshes.length,
    materials: state.json.materials?.length ?? 0,
    textures: state.json.textures?.length ?? 0,
  };
}

export { writeGlb };
