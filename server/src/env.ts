import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  maxUploadMegapixels: Number(process.env.MAX_UPLOAD_MEGAPIXELS ?? 100),
  publicDemoEnabled: (process.env.PUBLIC_DEMO_ENABLED ?? "true") === "true",
  paidOcr: {
    provider: process.env.PAID_OCR_PROVIDER ?? "",
    apiKey: process.env.PAID_OCR_API_KEY ?? "",
    monthlyBudgetKrw: process.env.PAID_OCR_MONTHLY_BUDGET_KRW
      ? Number(process.env.PAID_OCR_MONTHLY_BUDGET_KRW)
      : null,
  },
};

// 유료 OCR은 provider + apiKey가 모두 명시적으로 채워져 있을 때만 "설정됨"으로 취급한다.
// 배포자가 값을 채우기 전까지는 절대 활성화되지 않는다 (9절: 사용자 승인 없이 활성화 금지).
export const isPaidOcrConfigured = Boolean(env.paidOcr.provider && env.paidOcr.apiKey);

// 데모 회사/팀 식별자는 시드 스크립트가 고정 ID로 생성한다.
export const DEMO_COMPANY_ID = "demo-company";
export const DEMO_TEAM_ID = "demo-team";
