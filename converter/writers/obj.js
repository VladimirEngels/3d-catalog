import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isEmissive } from "../core/materials.js";
import { prepareGeometries } from "../core/geometry.js";

function buildObjFromGeometry(vertices, uvs, faces, vOffset, normals, nOffset, uvOffset) {
  let obj = "";
  for (const [x, y, z] of vertices) obj += `v ${x} ${y} ${z}\n`;
  for (const [u, v] of uvs) obj += `vt ${u} ${1 - v}\n`;
  if (normals) for (const [x, y, z] of normals) obj += `vn ${x} ${y} ${z}\n`;

  for (const face of faces) {
    const corners = face.map((index) => {
      const fields = [index + vOffset];
      if (uvs.length) fields.push(index + uvOffset);
      else if (normals) fields.push("");
      if (normals) fields.push(index + nOffset);
      return fields.join("/");
    });
    obj += `f ${corners.join(" ")}\n`;
  }
  return obj;
}

function prepareModel(geometries) {
  const hasMaterials = geometries.some(
    (g) =>
      g.textureBuf ||
      g.color ||
      g.vertexColor ||
      g.transparency !== undefined ||
      g.material !== undefined,
  );

  let mtl = "";
  const textures = [];

  const texNames = new Map();
  const matNames = new Map();

  const texFileName = (buf) => {
    const key = crypto.createHash("sha1").update(buf).digest("hex");
    let name = texNames.get(key);
    if (!name) {
      const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : "png";
      name = `texture_${texNames.size}.${ext}`;
      texNames.set(key, name);
      textures.push({ name, buf });
    }
    return name;
  };

  const materialOf = ({ textureBuf, color, transparency, vertexColor, material }) => {
    const base = !textureBuf && color ? color : { r: 1, g: 1, b: 1 };
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const tint = vertexColor
      ? {
          r: clamp01(base.r * vertexColor.r),
          g: clamp01(base.g * vertexColor.g),
          b: clamp01(base.b * vertexColor.b),
        }
      : base;
    const kd = `${tint.r} ${tint.g} ${tint.b}`;
    const texName = textureBuf ? texFileName(textureBuf) : null;
    const alpha = 1 - Math.min(Math.max(transparency ?? 0, 0), 1);

    const glow = isEmissive(material);
    const matKey = `${texName ?? ""}|${kd}|${alpha}|${glow ? "e" : ""}`;
    let matName = matNames.get(matKey);
    if (!matName) {
      matName = `mat_${matNames.size}`;
      matNames.set(matKey, matName);
      mtl += `newmtl ${matName}\nKa 1 1 1\nKd ${kd}\n`;
      if (alpha < 1) mtl += `d ${alpha}\nTr ${1 - alpha}\n`;
      if (glow) mtl += `Ke ${kd}\n`;
      if (texName) mtl += `map_Kd ${texName}\n`;
      mtl += "\n";
    }
    return matName;
  };

  return {
    hasMaterials,
    textures,
    materialOf,
    getMtl: () => (hasMaterials ? mtl : null),
  };
}

function* objChunks(geometries, prepared) {
  const { hasMaterials, materialOf } = prepared;
  yield "# 3D Catalog Converter\n";
  if (hasMaterials) yield "mtllib model.mtl\n\n";

  let vOffset = 0;
  let nOffset = 0;
  let uvOffset = 0;
  for (let i = 0; i < geometries.length; i++) {
    const geo = geometries[i];
    const norms = geo.normals && geo.normals.length === geo.vertices.length ? geo.normals : null;
    yield `o mesh_${geo.meshId ?? i}_${i}\n`;
    if (hasMaterials) yield `usemtl ${materialOf(geo)}\n`;
    yield buildObjFromGeometry(geo.vertices, geo.uvs, geo.faces, vOffset, norms, nOffset, uvOffset);
    vOffset += geo.vertices.length;
    uvOffset += geo.uvs.length;
    if (norms) nOffset += norms.length;
  }
}

async function writeModel(geometries, dir, objFileName = "model.obj") {
  fs.mkdirSync(dir, { recursive: true });
  geometries = prepareGeometries(geometries);
  const prepared = prepareModel(geometries);
  const objPath = path.join(dir, objFileName);

  const hash = crypto.createHash("sha1");
  let objBytes = 0;
  const out = fs.createWriteStream(objPath);

  function* chunks() {
    for (const chunk of objChunks(geometries, prepared)) {
      hash.update(chunk);
      objBytes += Buffer.byteLength(chunk);
      yield chunk;
    }
  }
  await pipeline(Readable.from(chunks()), out);

  const mtl = prepared.getMtl();
  if (mtl) fs.writeFileSync(path.join(dir, "model.mtl"), mtl);
  for (const { name, buf } of prepared.textures) fs.writeFileSync(path.join(dir, name), buf);

  return {
    objPath,
    objBytes,
    sha1: hash.digest("hex"),
    mtlSha1: mtl ? crypto.createHash("sha1").update(mtl).digest("hex") : null,
    textures: prepared.textures,
    mtl,
  };
}

export { writeModel };
