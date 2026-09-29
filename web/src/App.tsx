import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "./state/store";
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAppStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
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
  );
}
