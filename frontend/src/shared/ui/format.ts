
export function formatNumber(value: number): string {
  return value.toLocaleString("ru-RU");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}
