import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const MODEL_HASH = "b64a964ac02e37de542bc8ab2dce712c5c2b4e65d8d9a14914887049c5bdaf12";
export const upscaleModelPath = () =>
  process.env.UPSCALE_MODEL_PATH ??
  resolve(import.meta.dirname, "../../../storage/ai/general-x4v3.onnx");

export async function verifyUpscaleModel() {
  let bytes;
  try {
    bytes = await readFile(upscaleModelPath());
  } catch {
    throw new Error("Модель увеличения текстур не установлена. Настройте UPSCALE_MODEL_PATH.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== MODEL_HASH) {
    throw new Error("Контрольная сумма модели увеличения текстур не совпадает");
  }
}

async function infer(session, input, width, height) {
  const tensor = new Float32Array(3 * width * height);
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) {
      tensor[channel * width * height + index] = input[index * 3 + channel] / 255;
    }
  }
  const outputs = await session.run({
    input: new ort.Tensor("float32", tensor, [1, 3, height, width]),
  });
  const output = outputs.output;
  try {
    if (!output || output.dims.join(",") !== [1, 3, height * 4, width * 4].join(",")) {
      throw new Error("Неверный размер результата нейросети");
    }
    const result = Buffer.alloc(width * height * 16 * 3);
    for (let index = 0; index < width * height * 16; index++) {
      for (let channel = 0; channel < 3; channel++) {
        const value = output.data[channel * width * height * 16 + index];
        if (!Number.isFinite(value)) throw new Error("Нейросеть вернула некорректные пиксели");
        result[index * 3 + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
      }
    }
    return result;
  } finally {
    output?.dispose();
  }
}

async function enlarge(session, input, width, height, deadline) {
  const result = Buffer.alloc(width * height * 16 * 3);
  const core = 128;
  const margin = 40;
  for (let top = 0; top < height; top += core) {
    for (let left = 0; left < width; left += core) {
      if (performance.now() > deadline) throw new Error("Превышено время увеличения текстур");
      const x0 = Math.max(0, left - margin);
      const y0 = Math.max(0, top - margin);
      const x1 = Math.min(width, left + core + margin);
      const y1 = Math.min(height, top + core + margin);
      const patchWidth = x1 - x0;
      const patchHeight = y1 - y0;
      const patch = Buffer.alloc(patchWidth * patchHeight * 3);
      for (let y = 0; y < patchHeight; y++) {
        input.copy(
          patch,
          y * patchWidth * 3,
          ((y + y0) * width + x0) * 3,
          ((y + y0) * width + x1) * 3,
        );
      }
      const prediction = await infer(session, patch, patchWidth, patchHeight);
      for (let y = 0; y < Math.min(core, height - top) * 4; y++) {
        const start = ((y + (top - y0) * 4) * patchWidth * 4 + (left - x0) * 4) * 3;
        prediction.copy(
          result,
          ((top * 4 + y) * width * 4 + left * 4) * 3,
          start,
          start + Math.min(core, width - left) * 4 * 3,
        );
      }
    }
  }
  return result;
}

export async function upscaleTextures(geometries, folder) {
  const textures = new Map();
  for (const geometry of geometries) {
    if (!geometry.textureBuf) continue;
    const key = createHash("sha256").update(geometry.textureBuf).digest("hex");
    if (!textures.has(key)) textures.set(key, { buffer: geometry.textureBuf });
  }
  const report = { model: "Real-ESRGAN General x4v3, шумоподавление 0,5", scale: 4, items: [] };
  let pixels = 0;
  for (const texture of textures.values()) {
    const metadata = await sharp(texture.buffer, { limitInputPixels: 16777216 }).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error("Не удалось прочитать размеры текстуры");
    const item = { index: report.items.length, width, height, status: "skipped" };
    if (width > 1024 || height > 1024) item.reason = "Размер больше 1024 пикселей";
    else if (pixels + width * height > 1048576)
      item.reason = "Превышен общий лимит 1 048 576 входных пикселей";
    else {
      item.status = "done";
      pixels += width * height;
    }
    texture.item = item;
    texture.hasAlpha = metadata.hasAlpha;
    report.items.push(item);
  }
  if (!report.items.length) report.message = "Цветовые текстуры отсутствуют";
  if (!pixels) return { geometries, report };
  await verifyUpscaleModel();
  await mkdir(folder);
  const session = await ort.InferenceSession.create(upscaleModelPath(), {
    executionProviders: ["cpu"],
    intraOpNumThreads: 4,
    interOpNumThreads: 1,
  });
  const deadline = performance.now() + 75000;
  try {
    for (const texture of textures.values()) {
      const item = texture.item;
      if (item.status !== "done") continue;
      const rgb = await sharp(texture.buffer).removeAlpha().toColourspace("srgb").raw().toBuffer();
      const enlarged = await enlarge(session, rgb, item.width, item.height, deadline);
      let image = sharp(enlarged, {
        raw: { width: item.width * 4, height: item.height * 4, channels: 3 },
      });
      if (texture.hasAlpha) {
        const alpha = await sharp(texture.buffer)
          .extractChannel("alpha")
          .resize(item.width * 4, item.height * 4, { kernel: "linear" })
          .toColourspace("b-w")
          .raw()
          .toBuffer();
        image = image.joinChannel(alpha, {
          raw: { width: item.width * 4, height: item.height * 4, channels: 1 },
        });
      }
      texture.enlarged = await image.png().toBuffer();
      item.outputWidth = item.width * 4;
      item.outputHeight = item.height * 4;
      await sharp(texture.buffer)
        .png()
        .toFile(join(folder, `before-${item.index}.png`));
      await sharp(texture.enlarged).toFile(join(folder, `after-${item.index}.png`));
    }
  } finally {
    await session.release();
  }
  const result = geometries.map((geometry) => {
    if (!geometry.textureBuf) return geometry;
    const key = createHash("sha256").update(geometry.textureBuf).digest("hex");
    const replacement = textures.get(key).enlarged;
    return replacement ? { ...geometry, textureBuf: replacement } : geometry;
  });
  return { geometries: result, report };
}
