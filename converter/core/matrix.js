function matMul(a, b) {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}

function matInvert(m) {
  const a = [];
  for (let i = 0; i < 4; i++) {
    a.push([...m.slice(i * 4, i * 4 + 4), ...[0, 0, 0, 0].map((_, j) => (i === j ? 1 : 0))]);
  }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (!f) continue;
      for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k];
    }
  }
  const out = [];
  for (let i = 0; i < 4; i++) out.push(...a[i].slice(4));
  return out;
}

function toColumnMajor(m) {
  return [
    m[0],
    m[4],
    m[8],
    m[12],
    m[1],
    m[5],
    m[9],
    m[13],
    m[2],
    m[6],
    m[10],
    m[14],
    m[3],
    m[7],
    m[11],
    m[15],
  ];
}

export { matMul, matInvert, toColumnMajor };

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function nodeMatrix(node) {
  if (node.matrix !== undefined) {
    if (
      !Array.isArray(node.matrix) ||
      node.matrix.length !== 16 ||
      !node.matrix.every(Number.isFinite)
    )
      throw new Error("Неверная матрица узла glTF");
    return toColumnMajor(node.matrix);
  }
  const t = node.translation ?? [0, 0, 0];
  const s = node.scale ?? [1, 1, 1];
  const q = node.rotation ?? [0, 0, 0, 1];
  for (const [array, length] of [
    [t, 3],
    [s, 3],
    [q, 4],
  ])
    if (!Array.isArray(array) || array.length !== length || !array.every(Number.isFinite))
      throw new Error("Неверная трансформация glTF");
  const len = Math.hypot(...q);
  if (!len) throw new Error("Нулевой кватернион glTF");
  const [x, y, z, w] = q.map((value) => value / len);
  return [
    (1 - 2 * y * y - 2 * z * z) * s[0],
    (2 * x * y - 2 * z * w) * s[1],
    (2 * x * z + 2 * y * w) * s[2],
    t[0],
    (2 * x * y + 2 * z * w) * s[0],
    (1 - 2 * x * x - 2 * z * z) * s[1],
    (2 * y * z - 2 * x * w) * s[2],
    t[1],
    (2 * x * z - 2 * y * w) * s[0],
    (2 * y * z + 2 * x * w) * s[1],
    (1 - 2 * x * x - 2 * y * y) * s[2],
    t[2],
    0,
    0,
    0,
    1,
  ];
}
export function transformPoint(matrix, point) {
  return [0, 1, 2].map(
    (row) =>
      matrix[row * 4] * point[0] +
      matrix[row * 4 + 1] * point[1] +
      matrix[row * 4 + 2] * point[2] +
      matrix[row * 4 + 3],
  );
}
export function transformNormal(inverse, normal) {
  const vector = [0, 1, 2].map(
    (row) => inverse[row] * normal[0] + inverse[4 + row] * normal[1] + inverse[8 + row] * normal[2],
  );
  const length = Math.hypot(...vector);
  if (!length) throw new Error("Неверная нормаль после трансформации");
  return vector.map((value) => value / length);
}
export function boneMatrix(bone) {
  return (
    bone.matrix ?? [
      bone.rot[0],
      bone.rot[1],
      bone.rot[2],
      bone.pos[0],
      bone.rot[3],
      bone.rot[4],
      bone.rot[5],
      bone.pos[1],
      bone.rot[6],
      bone.rot[7],
      bone.rot[8],
      bone.pos[2],
      0,
      0,
      0,
      1,
    ]
  );
}
export function bakeSkin(geo) {
  const { skin } = geo;
  const matrices = skin.bones.map((bone, i) => {
    const world = matMul(geo.instanceMatrix ?? identity(), boneMatrix(bone));
    const inverse = skin.inverseBindMatrices?.[i] ?? matInvert(world);
    if (!inverse) throw new Error("Необратимая матрица скелета");
    return matMul(world, inverse);
  });
  const normals = [];
  const vertices = geo.vertices.map((point, i) => {
    const sum = skin.weights[i].reduce((a, b) => a + b, 0);
    const mixed = new Array(16).fill(0);
    for (let k = 0; k < 4; k++)
      for (let a = 0; a < 16; a++)
        mixed[a] += (matrices[skin.joints[i][k]][a] * skin.weights[i][k]) / sum;
    if (geo.normals) {
      const inverse = matInvert(mixed);
      if (!inverse) throw new Error("Необратимая трансформация вершины скелета");
      normals.push(transformNormal(inverse, geo.normals[i]));
    }
    return transformPoint(mixed, point);
  });
  return {
    ...geo,
    vertices,
    ...(geo.normals ? { normals } : {}),
    tangents: undefined,
    skin: undefined,
    instanceMatrix: undefined,
  };
}
