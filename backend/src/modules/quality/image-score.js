export function imageSimilarity(before, after, width, height) {
  if (before.length !== width * height * 4 || after.length !== before.length) {
    throw new Error("Неверный размер изображений для сравнения");
  }
  let total = 0;
  let windows = 0;
  for (let top = 0; top < height; top += 8) {
    for (let left = 0; left < width; left += 8) {
      const pixels = [];
      let visible = false;
      for (let y = top; y < Math.min(top + 8, height); y++) {
        for (let x = left; x < Math.min(left + 8, width); x++) {
          const offset = (y * width + x) * 4;
          pixels.push(offset);
          visible ||= before[offset + 3] > 0 || after[offset + 3] > 0;
        }
      }
      if (!visible) continue;
      for (let channel = 0; channel < 3; channel++) {
        let sumA = 0;
        let sumB = 0;
        let squareA = 0;
        let squareB = 0;
        let product = 0;
        for (const offset of pixels) {
          const alphaA = before[offset + 3] / 255;
          const alphaB = after[offset + 3] / 255;
          const a = before[offset + channel] * alphaA + 32 * (1 - alphaA);
          const b = after[offset + channel] * alphaB + 32 * (1 - alphaB);
          sumA += a;
          sumB += b;
          squareA += a * a;
          squareB += b * b;
          product += a * b;
        }
        const count = pixels.length;
        const meanA = sumA / count;
        const meanB = sumB / count;
        const varianceA = Math.max(0, squareA / count - meanA * meanA);
        const varianceB = Math.max(0, squareB / count - meanB * meanB);
        const covariance = product / count - meanA * meanB;
        const score =
          ((2 * meanA * meanB + 6.5025) * (2 * covariance + 58.5225)) /
          ((meanA * meanA + meanB * meanB + 6.5025) * (varianceA + varianceB + 58.5225));
        total += Math.max(0, Math.min(1, score));
        windows++;
      }
    }
  }
  if (!windows) throw new Error("На изображениях нет видимой поверхности модели");
  return Math.round((total / windows) * 10000) / 100;
}
