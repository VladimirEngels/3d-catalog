
import { ApiError } from "@shared/api/errors";

export interface DuplicateModel {
  id: number;
  name: string;
  authorName: string;
  createdAt: string;
  format: string;
  triangles: number;
  hasPreview: boolean;
}

export class DuplicateModelError extends ApiError {
  duplicate: DuplicateModel;

  constructor(message: string, duplicate: DuplicateModel) {
    super(409, message);
    this.duplicate = duplicate;
  }
}

function sendForm<T>(url: string, form: FormData, onProgress: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      const data = xhr.response ?? {};
      if (xhr.status === 201) {
        resolve(data);
      } else if (xhr.status === 401) {
        location.href = "/pages/login.html";
      } else if (xhr.status === 409 && data.duplicate) {
        reject(new DuplicateModelError(data.error, data.duplicate));
      } else {
        reject(new ApiError(xhr.status, data.error ?? "Не удалось загрузить файл. Попробуйте ещё раз"));
      }
    });
    xhr.addEventListener("error", () => reject(new ApiError(0, "Не удалось связаться с сервером. Проверьте подключение")));

    xhr.send(form);
  });
}

export interface UploadFields {
  name: string;
  description: string;
  tags: string;
  collectionId: string;
}

export function uploadModel(
  teamId: number,
  file: File,
  fields: UploadFields,
  onProgress: (percent: number) => void,
): Promise<{ modelId: number; textureCount: number }> {
  const form = new FormData();
  form.append("name", fields.name);
  form.append("description", fields.description);
  form.append("tags", fields.tags);
  form.append("collectionId", fields.collectionId);
  form.append("file", file);
  return sendForm(`/api/teams/${teamId}/models`, form, onProgress);
}

export function uploadVersion(
  teamId: number,
  modelId: number,
  file: File,
  comment: string,
  onProgress: (percent: number) => void,
): Promise<{ versionNumber: number }> {
  const form = new FormData();
  form.append("comment", comment);
  form.append("file", file);
  return sendForm(`/api/teams/${teamId}/models/${modelId}/versions`, form, onProgress);
}
