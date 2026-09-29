import { NavLink, useNavigate } from "react-router-dom";
import { useAppStore } from "../state/store";

const navItems = [
  { to: "/dashboard", label: "대시보드" },
  { to: "/investigations/new", label: "새 분석 등록" },
  { to: "/channels", label: "채널 리스트" },
  { to: "/reports", label: "월간 보고서" },
  { to: "/teams", label: "팀 관리" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, memberships, currentTeamId, setCurrentTeamId, logout } = useAppStore();
  const navigate = useNavigate();

  const currentMembership = memberships.find((m) => m.teamId === currentTeamId);

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-navy-900 text-white flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-navy-700">
          <div className="font-bold text-lg">365mc 검색 점유율</div>
          <div className="text-xs text-slate-400 mt-1">검색 점유율 분석 도구</div>
        </div>
        <nav className="flex-1 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm ${isActive ? "bg-navy-700 text-white" : "text-slate-300 hover:bg-navy-800"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-navy-700 text-xs text-slate-400">
          <div>{user?.name} ({user?.email})</div>
          <div>{user?.globalRole === "ADMIN" ? "전체 관리자" : "일반 사용자"}</div>
          <button
            className="mt-2 text-slate-300 underline"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            현재 팀:{" "}
            <select
              className="border border-slate-300 rounded px-2 py-1 text-sm ml-1"
              value={currentTeamId ?? ""}
              onChange={(e) => setCurrentTeamId(e.target.value || null)}
            >
              {memberships.length === 0 && <option value="">팀 없음 — 팀 관리에서 생성하세요</option>}
              {memberships.map((m) => (
                <option key={m.teamId} value={m.teamId}>
                  {m.teamName}
                </option>
              ))}
            </select>
            {currentMembership && (
              <span className="ml-2 badge bg-blue-50 text-blue-700">
                {currentMembership.role === "TEAM_ADMIN" ? "팀관리자" : "팀원"}
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
