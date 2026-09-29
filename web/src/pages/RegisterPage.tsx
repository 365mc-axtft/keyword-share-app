import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useAppStore } from "../state/store";
import { ApiClientError } from "../api/client";

export function RegisterPage() {
  const [mode, setMode] = useState<"new-company" | "join">("new-company");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAppStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.register({
        companyName: mode === "new-company" ? companyName : undefined,
        companyId: mode === "join" ? companyId : undefined,
        name,
        email,
        password,
      });
      setAuth(res.token, res.user, []);
      navigate("/teams");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm">
        <h1 className="text-lg font-bold mb-4">회원가입</h1>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="flex gap-2 mb-4 text-sm">
          <button type="button" className={mode === "new-company" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("new-company")}>
            새 회사 만들기(관리자)
          </button>
          <button type="button" className={mode === "join" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("join")}>
            기존 회사 합류
          </button>
        </div>

        {mode === "new-company" ? (
          <>
            <label className="label">회사명</label>
            <input className="input mb-3" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </>
        ) : (
          <>
            <label className="label">회사 ID (관리자에게 문의)</label>
            <input className="input mb-3" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required />
          </>
        )}

        <label className="label">이름</label>
        <input className="input mb-3" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="label">이메일</label>
        <input className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label">비밀번호 (8자 이상)</label>
        <input className="input mb-4" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "처리 중..." : "가입하기"}
        </button>
        <div className="text-sm text-center mt-4">
          이미 계정이 있으신가요? <Link to="/login" className="text-blue-600 underline">로그인</Link>
        </div>
      </form>
    </div>
  );
}
