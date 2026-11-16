export async function readGltfMaterial(index, source) {
  if (index === undefined)
    return {
      color: { r: 1, g: 1, b: 1 },
      pbr: {
        metallicFactor: 1,
        roughnessFactor: 1,
        doubleSided: false,
        alphaMode: "OPAQUE",
      },
    };
  const material = source.json.materials?.[index];
  if (!Number.isSafeInteger(index) || !material || material.extensions)
    throw new Error("Неподдерживаемый материал glTF");
  const pbr = material.pbrMetallicRoughness ?? {};
  const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
  const emissive = material.emissiveFactor ?? [0, 0, 0];
  if (
    !Array.isArray(factor) ||
    factor.length !== 4 ||
    !factor.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
    !Array.isArray(emissive) ||
    emissive.length !== 3 ||
    !emissive.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  )
    throw new Error("Неверный цвет glTF");
  const metallic = pbr.metallicFactor ?? 1;
  const roughness = pbr.roughnessFactor ?? 1;
  const mode = material.alphaMode ?? "OPAQUE";
  const cutoff = material.alphaCutoff ?? 0.5;
  if (
    ![metallic, roughness, cutoff].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
    !["OPAQUE", "MASK", "BLEND"].includes(mode)
  )
    throw new Error("Неверные свойства PBR glTF");
  const result = {
    color: { r: 1, g: 1, b: 1 },
    vertexColor: { r: factor[0], g: factor[1], b: factor[2] },
    transparency: 1 - factor[3],
    pbr: {
      metallicFactor: metallic,
      roughnessFactor: roughness,
      emissiveFactor: emissive,
      alphaMode: mode,
      alphaCutoff: cutoff,
      doubleSided: material.doubleSided ?? false,
    },
    textureSamplers: {},
  };
  for (const [field, info] of [
    ["textureBuf", pbr.baseColorTexture],
    ["normalMapBuf", material.normalTexture],
    ["metallicRoughnessBuf", pbr.metallicRoughnessTexture],
    ["emissiveBuf", material.emissiveTexture],
    ["occlusionBuf", material.occlusionTexture],
  ]) {
    if (!info) continue;
    if ((info.texCoord ?? 0) !== 0 || info.extensions)
      throw new Error("Поддерживаются текстуры glTF с UV0 без расширений");
    const texture = source.json.textures?.[info.index];
    if (!Number.isSafeInteger(info.index) || !texture || texture.extensions)
      throw new Error("Неверная текстура glTF");
    result[field] = await source.image(texture.source);
    const sampler = texture.sampler === undefined ? {} : source.json.samplers?.[texture.sampler];
    if (!sampler) throw new Error("Не найден sampler glTF");
    const settings = {
      wrapS: sampler.wrapS ?? 10497,
      wrapT: sampler.wrapT ?? 10497,
    };
    if (
      ![33071, 33648, 10497].includes(settings.wrapS) ||
      ![33071, 33648, 10497].includes(settings.wrapT) ||
      (sampler.magFilter !== undefined && ![9728, 9729].includes(sampler.magFilter)) ||
      (sampler.minFilter !== undefined &&
        ![9728, 9729, 9984, 9985, 9986, 9987].includes(sampler.minFilter))
    )
      throw new Error("Неверный sampler glTF");
    if (sampler.magFilter !== undefined) settings.magFilter = sampler.magFilter;
    if (sampler.minFilter !== undefined) settings.minFilter = sampler.minFilter;
    result.textureSamplers[field] = settings;
    if (field === "normalMapBuf") {
      if (!Number.isFinite(info.scale ?? 1)) throw new Error("Неверный масштаб карты нормалей");
      result.pbr.normalScale = info.scale ?? 1;
    }
    if (field === "occlusionBuf") {
      if (
        !Number.isFinite(info.strength ?? 1) ||
        (info.strength ?? 1) < 0 ||
        (info.strength ?? 1) > 1
      )
        throw new Error("Неверная сила occlusion");
      result.pbr.occlusionStrength = info.strength ?? 1;
    }
  }
  return result;
}
