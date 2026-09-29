import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/asyncHandler";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: err.errors.map((e) => e.message).join(", "), issues: err.errors });
  }
  if (err && typeof err === "object" && "code" in err && (err as any).code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "FILE_TOO_LARGE", message: "업로드 용량 한도를 초과했습니다." });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  const message = err instanceof Error ? err.message : "서버 오류가 발생했습니다.";
  res.status(500).json({ error: "INTERNAL_ERROR", message });
}
