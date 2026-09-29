import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { env } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { teamsRouter } from "./routes/teams";
import { keywordsRouter } from "./routes/keywords";
import { channelsRouter } from "./routes/channels";
import { investigationsRouter } from "./routes/investigations";
import { tabAnalysesRouter } from "./routes/tabAnalyses";
import { dashboardRouter } from "./routes/dashboard";
import { reportsRouter } from "./routes/reports";
import { publicRouter } from "./routes/public";

/**
 * Express 앱 인스턴스를 별도로 내보낸다 (index.ts는 이 앱을 listen만 함).
 * 테스트 코드(예: routes/authorization.test.ts)가 실제 포트를 열지 않고도
 * supertest로 라우트를 직접 호출할 수 있게 하기 위함이다.
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), publicDemoEnabled: env.publicDemoEnabled });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/keywords", keywordsRouter);
  app.use("/api/channels", channelsRouter);
  app.use("/api/investigations", investigationsRouter);
  app.use("/api/tab-analyses", tabAnalysesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/public", publicRouter);

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: `경로를 찾을 수 없습니다: ${req.method} ${req.path}` });
  });

  // 프런트엔드(web/dist)가 빌드되어 있으면 같은 서버에서 정적 파일로 함께 서빙한다.
  // Render 같은 무료 호스팅에 "서버 하나"만 올려도 화면까지 같이 뜨게 하려는 목적
  // (별도 프런트엔드 서비스/도메인/CORS 설정이 필요 없어진다). 로컬 개발(Vite dev
  // 서버가 따로 5173에서 도는 경우)에는 web/dist가 없으므로 이 블록은 그냥 건너뛴다.
  const webDist = path.join(__dirname, "..", "..", "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else {
    app.use((req, res) => {
      res.status(404).json({ error: "NOT_FOUND", message: `경로를 찾을 수 없습니다: ${req.method} ${req.path}` });
    });
  }

  app.use(errorHandler);

  return app;
}
