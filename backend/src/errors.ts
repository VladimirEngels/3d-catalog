export class AppError extends Error {
  status: number;
  extra: object;

  constructor(status: number, message: string, extra: object = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
