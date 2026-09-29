import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useAppStore } from "../state/store";
import { ApiClientError } from "../api/client";

export function LoginPage() {
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
      const res = await authApi.login({ email, password });
      setAuth(res.token, res.user, res.memberships);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">365mc 검색 점유율 분석</h1>
        <p className="text-sm text-slate-500 mb-4">사내 운영 로그인</p>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <label className="label">이메일</label>
        <input className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label">비밀번호</label>
        <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
        <div className="text-sm text-center mt-4">
          계정이 없으신가요? <Link to="/register" className="text-blue-600 underline">회원가입</Link>
        </div>
        <div className="text-sm text-center mt-2">
          <Link to="/demo" className="text-slate-500 underline">로그인 없이 공개 시연 보기</Link>
        </div>
      </form>
    </div>
  );
}
