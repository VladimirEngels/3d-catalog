import { prepareGeometries } from "../core/geometry.js";
import {
  identity,
  matMul,
  matInvert,
  toColumnMajor,
  nodeMatrix,
  transformPoint,
  transformNormal,
} from "../core/matrix.js";
import { loadGltfData } from "./gltf-data.js";
import { readGltfMaterial } from "./gltf-material.js";

export async function readGltf(data, readResource, isBinary = false) {
  const source = await loadGltfData(data, readResource, isBinary);
  const { json, accessor } = source;
  const nodes = json.nodes ?? [];
  const parents = new Array(nodes.length).fill(-1);
  const worlds = new Map();
  const active = new Set();
  if (nodes.length > 100000) throw new Error("Слишком много узлов glTF");
  const nodeAt = (index) => {
    if (!Number.isSafeInteger(index) || !nodes[index])
      throw new Error("Неверная ссылка на узел glTF");
    return nodes[index];
  };
  for (const [i, node] of nodes.entries())
    for (const child of node.children ?? []) {
      nodeAt(child);
      if (parents[child] !== -1) throw new Error("Узел glTF имеет несколько родителей");
      parents[child] = i;
    }
  const world = (index) => {
    nodeAt(index);
    if (worlds.has(index)) return worlds.get(index);
    if (active.has(index)) throw new Error("Цикл узлов glTF");
    active.add(index);
    const matrix = matMul(
      parents[index] === -1 ? identity() : world(parents[index]),
      nodeMatrix(nodes[index]),
    );
    active.delete(index);
    worlds.set(index, matrix);
    return matrix;
  };
  for (let i = 0; i < nodes.length; i++) world(i);
  const geometries = [];
  const losses = new Set();
  const materials = new Map();
  if (json.animations?.length)
    losses.add("Анимации glTF не переносятся; сохраняется исходная статическая поза");
  const scene = json.scenes?.[json.scene ?? 0];
  if (json.scenes && !scene) throw new Error("Сцена glTF не найдена");
  const roots = scene?.nodes ?? nodes.flatMap((_, i) => (parents[i] === -1 ? [i] : []));
  const visited = new Set();
  const visit = async (index) => {
    const node = nodeAt(index);
    if (visited.has(index)) throw new Error("Повторный узел в сцене glTF");
    visited.add(index);
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      if (!Number.isSafeInteger(node.mesh) || !mesh || !Array.isArray(mesh.primitives))
        throw new Error("Сетка glTF не найдена");
      for (const primitive of mesh.primitives) {
        if (primitive.extensions || primitive.targets)
          throw new Error("Расширения и морф-цели glTF пока не поддерживаются");
        const attrs = primitive.attributes ?? {};
        let vertices = accessor(attrs.POSITION, "VEC3", [5126]);
        const normals =
          attrs.NORMAL === undefined ? undefined : accessor(attrs.NORMAL, "VEC3", [5126]);
        const uvs =
          attrs.TEXCOORD_0 === undefined
            ? undefined
            : accessor(attrs.TEXCOORD_0, "VEC2", [5121, 5123, 5126]);
        const tangents =
          attrs.TANGENT === undefined ? undefined : accessor(attrs.TANGENT, "VEC4", [5126]);
        let colors;
        if (attrs.COLOR_0 !== undefined) {
          const type = json.accessors?.[attrs.COLOR_0]?.type;
          if (!["VEC3", "VEC4"].includes(type)) throw new Error("Неверный цвет вершины glTF");
          colors = accessor(attrs.COLOR_0, type, [5121, 5123, 5126]).map((color) =>
            color.length === 3 ? [...color, 1] : color,
          );
        }
        for (const name of Object.keys(attrs))
          if (
            ![
              "POSITION",
              "NORMAL",
              "TEXCOORD_0",
              "TANGENT",
              "COLOR_0",
              "JOINTS_0",
              "WEIGHTS_0",
            ].includes(name)
          ) {
            if (name === "JOINTS_1" || name === "WEIGHTS_1")
              throw new Error("Более четырёх влияний костей на вершину не поддерживается");
            losses.add(`Атрибут glTF ${name} не переносится`);
          }
        const indices =
          primitive.indices === undefined
            ? vertices.map((_, i) => i)
            : accessor(primitive.indices, "SCALAR", [5121, 5123, 5125]).flat();
        if (indices.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices.length))
          throw new Error("Индекс glTF вне диапазона");
        const faces = [];
        const mode = primitive.mode ?? 4;
        if (![4, 5, 6].includes(mode)) throw new Error("Поддерживаются треугольные примитивы glTF");
        if (mode === 4 && indices.length % 3)
          throw new Error("Неверное количество индексов треугольников glTF");
        for (let i = mode === 4 ? 0 : 2; i < indices.length; i += mode === 4 ? 3 : 1) {
          const face =
            mode === 4
              ? indices.slice(i, i + 3)
              : mode === 6
                ? [indices[0], indices[i - 1], indices[i]]
                : i % 2
                  ? [indices[i - 1], indices[i - 2], indices[i]]
                  : [indices[i - 2], indices[i - 1], indices[i]];
          if (new Set(face).size === 3) faces.push(face.map((value) => value + 1));
        }
        if (!materials.has(primitive.material))
          materials.set(primitive.material, await readGltfMaterial(primitive.material, source));
        let geo = {
          vertices,
          faces,
          ...(uvs ? { uvs } : {}),
          ...(normals ? { normals } : {}),
          ...(tangents ? { tangents } : {}),
          ...(colors ? { colors } : {}),
          ...materials.get(primitive.material),
        };
        if (node.skin !== undefined) {
          const skin = json.skins?.[node.skin];
          if (
            !Number.isSafeInteger(node.skin) ||
            !skin ||
            !Array.isArray(skin.joints) ||
            new Set(skin.joints).size !== skin.joints.length ||
            skin.joints.length > 65536
          )
            throw new Error("Неверный скелет glTF");
          const joints = accessor(attrs.JOINTS_0, "VEC4", [5121, 5123]);
          const weights = accessor(attrs.WEIGHTS_0, "VEC4", [5121, 5123, 5126]);
          const map = new Map(skin.joints.map((id, i) => [id, i]));
          const bones = skin.joints.map((id) => {
            nodeAt(id);
            let parent = parents[id];
            while (parent !== -1 && !map.has(parent)) parent = parents[parent];
            return {
              name: nodes[id].name ?? `bone_${id}`,
              parent: parent === -1 ? -1 : map.get(parent),
              matrix: world(id),
            };
          });
          const inverses =
            skin.inverseBindMatrices === undefined
              ? bones.map(identity)
              : accessor(skin.inverseBindMatrices, "MAT4", [5126]).map(toColumnMajor);
          if (inverses.length !== bones.length)
            throw new Error("Неверное количество inverseBindMatrices");
          geo.skin = { bones, joints, weights, inverseBindMatrices: inverses };
        } else {
          const matrix = world(index);
          const inverse = matInvert(matrix);
          if (!inverse) throw new Error("Необратимая трансформация glTF");
          geo.vertices = vertices.map((point) => transformPoint(matrix, point));
          if (normals) geo.normals = normals.map((normal) => transformNormal(inverse, normal));
          const determinant =
            matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
            matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8]) +
            matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
          if (determinant < 0) geo.faces = faces.map(([a, b, c]) => [a, c, b]);
          if (tangents)
            geo.tangents = tangents.map(([x, y, z, w]) => {
              const v = [
                matrix[0] * x + matrix[1] * y + matrix[2] * z,
                matrix[4] * x + matrix[5] * y + matrix[6] * z,
                matrix[8] * x + matrix[9] * y + matrix[10] * z,
              ];
              const length = Math.hypot(...v);
              if (!length) throw new Error("Нулевой tangent glTF");
              return [...v.map((value) => value / length), w * Math.sign(determinant)];
            });
        }
        geometries.push(geo);
      }
    }
    for (const child of node.children ?? []) await visit(child);
  };
  for (const root of roots) await visit(root);
  return { geometries: prepareGeometries(geometries), losses: [...losses] };
}
