import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "./state/store";
import { authApi } from "./api";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TeamsPage } from "./pages/TeamsPage";
import { ChannelListPage } from "./pages/ChannelListPage";
import { NewInvestigationPage } from "./pages/NewInvestigationPage";
import { InvestigationWorkspacePage } from "./pages/InvestigationWorkspacePage";
import { DashboardPage } from "./pages/DashboardPage";
import { MonthlyReportPage } from "./pages/MonthlyReportPage";
import { PublicDemoPage } from "./pages/PublicDemoPage";

// 테스트 단계 임시 스위치 (render.yaml/env.ts의 AUTH_DISABLED와 쌍을 이룸).
// 운영 전환 시 이 빌드 환경변수를 지우면 로그인 화면이 다시 필수가 된다.
const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "true";
const NO_AUTH_PLACEHOLDER_TOKEN = "no-auth-disabled";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  if (!token && !AUTH_DISABLED) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

/**
 * AUTH_DISABLED 모드에서는 로그인 화면 없이 서버가 자동으로 내려주는 고정
 * 테스트 계정 정보(/auth/me)를 한 번 받아와 평소 로그인했을 때와 동일하게
 * 스토어를 채운다 — 팀 전환기/사용자 이름 표시 등 나머지 화면은 그대로 동작한다.
 */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  const setAuth = useAppStore((s) => s.setAuth);
  const [ready, setReady] = useState(!AUTH_DISABLED || Boolean(token));

  useEffect(() => {
    if (!AUTH_DISABLED || token) return;
    authApi
      .me()
      .then((res) => setAuth(NO_AUTH_PLACEHOLDER_TOKEN, res.user, res.memberships))
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return <div className="p-6 text-slate-500">불러오는 중...</div>;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthBootstrap>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/demo" element={<PublicDemoPage />} />

        <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
        <Route path="/channels" element={<ProtectedRoute><ChannelListPage /></ProtectedRoute>} />
        <Route path="/investigations/new" element={<ProtectedRoute><NewInvestigationPage /></ProtectedRoute>} />
        <Route path="/investigations/:id" element={<ProtectedRoute><InvestigationWorkspacePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><MonthlyReportPage /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthBootstrap>
  );
}
