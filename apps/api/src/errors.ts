// Error codes — clients map these codes to i18n keys. Server responses
// never carry user-facing UI text, so no string is hardcoded for display.
// Kode error — klien memetakan kode ini ke kunci i18n. Respons server
// tidak membawa teks UI, jadi tidak ada string tampilan yang di-hardcode.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export const badRequest = (code: string) => new ApiError(400, code);
export const unauthorized = (code = "UNAUTHORIZED") => new ApiError(401, code);
export const forbidden = (code = "FORBIDDEN") => new ApiError(403, code);
export const gone = (code: string) => new ApiError(410, code);
export const notFound = (code = "NOT_FOUND") => new ApiError(404, code);
export const conflict = (code: string) => new ApiError(409, code);
export const tooMany = (code: string) => new ApiError(429, code);
