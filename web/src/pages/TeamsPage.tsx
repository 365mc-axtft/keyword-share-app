import { useEffect, useState } from "react";
import { teamsApi, keywordsApi } from "../api";
import { useAppStore } from "../state/store";
import { Team, KeywordGroup, Membership } from "../types";
import { ApiClientError } from "../api/client";

export function TeamsPage() {
  const { user, memberships, setMemberships, currentTeamId, setCurrentTeamId } = useAppStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [deletedTeams, setDeletedTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [groups, setGroups] = useState<KeywordGroup[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState("");

  async function refreshTeams() {
    const res = await teamsApi.list();
    setTeams(res.teams);
    if (user?.globalRole === "ADMIN") {
      const del = await teamsApi.deleted();
      setDeletedTeams(del.teams);
    }
    // 멤버십 갱신 (레이아웃 팀 선택기와 동기화)
    const memberships: Membership[] = res.teams
      .filter((t) => t.myRole || user?.globalRole === "ADMIN")
      .map((t) => ({ teamId: t.id, teamName: t.name, role: (t.myRole as any) ?? "MEMBER" }));
    setMemberships(memberships);
  }

  useEffect(() => {
    refreshTeams().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!currentTeamId) return;
    keywordsApi.groups(currentTeamId).then((r) => setGroups(r.groups));
    teamsApi.members(currentTeamId).then((r) => setMembers(r.members));
  }, [currentTeamId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await teamsApi.create(newTeamName);
      setNewTeamName("");
      await refreshTeams();
      setCurrentTeamId(res.team.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "팀 생성 실패");
    }
  }

  async function handleRename(teamId: string) {
    setError(null);
    try {
      await teamsApi.rename(teamId, renameValue);
      setRenameTarget(null);
      await refreshTeams();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "이름 변경 실패");
    }
  }

  async function handleDelete(teamId: string) {
    if (!confirm("이 팀을 삭제할까요? 나중에 관리자가 복구할 수 있습니다.")) return;
    setError(null);
    try {
      await teamsApi.remove(teamId);
      await refreshTeams();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "삭제 실패");
    }
  }

  async function handleRestore(teamId: string) {
    setError(null);
    try {
      await teamsApi.restore(teamId);
      await refreshTeams();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "복구 실패");
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTeamId) return;
    setError(null);
    try {
      await teamsApi.addMember(currentTeamId, newMemberEmail, "MEMBER");
      setNewMemberEmail("");
      const r = await teamsApi.members(currentTeamId);
      setMembers(r.members);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "팀원 추가 실패");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold">팀 관리</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="card">
        <h2 className="font-semibold mb-3">전체 팀</h2>
        <ul className="divide-y divide-slate-100">
          {teams.map((t) => (
            <li key={t.id} className="py-2 flex items-center justify-between">
              {renameTarget === t.id ? (
                <div className="flex gap-2 items-center flex-1">
                  <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                  <button className="btn-primary" onClick={() => handleRename(t.id)}>저장</button>
                  <button className="btn-secondary" onClick={() => setRenameTarget(null)}>취소</button>
                </div>
              ) : (
                <>
                  <span>
                    {t.name} {t.id === currentTeamId && <span className="badge bg-blue-50 text-blue-700 ml-1">현재 팀</span>}
                  </span>
                  {/* 버튼 간 간격 확보 (4절 요구사항) */}
                  <div className="flex gap-3">
                    <button className="btn-secondary" onClick={() => { setRenameTarget(t.id); setRenameValue(t.name); }}>이름 변경</button>
                    <button className="btn-danger" onClick={() => handleDelete(t.id)}>삭제</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={handleCreate} className="flex gap-3 mt-4">
          <input className="input" placeholder="새 팀 이름" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} required />
          <button className="btn-primary shrink-0">팀 추가</button>
        </form>
      </div>

      {user?.globalRole === "ADMIN" && deletedTeams.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">삭제된 팀 (복구 가능)</h2>
          <ul className="divide-y divide-slate-100">
            {deletedTeams.map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between">
                <span>{t.name}</span>
                <button className="btn-secondary" onClick={() => handleRestore(t.id)}>복구</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentTeamId && (
        <div className="card">
          <h2 className="font-semibold mb-3">현재 팀 팀원 ({teams.find((t) => t.id === currentTeamId)?.name})</h2>
          <ul className="divide-y divide-slate-100 mb-3">
            {members.map((m) => (
              <li key={m.id} className="py-2 flex justify-between text-sm">
                <span>{m.name} ({m.email})</span>
                <span className="badge bg-slate-100">{m.role === "TEAM_ADMIN" ? "팀관리자" : "팀원"}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddMember} className="flex gap-3">
            <input className="input" placeholder="추가할 사용자 이메일 (같은 회사 가입자)" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
            <button className="btn-primary shrink-0">팀원 추가</button>
          </form>
        </div>
      )}

      {currentTeamId && (
        <div className="card">
          <h2 className="font-semibold mb-3">키워드그룹</h2>
          <KeywordGroupManager teamId={currentTeamId} groups={groups} onChange={setGroups} />
        </div>
      )}
    </div>
  );
}

function KeywordGroupManager({ teamId, groups, onChange }: { teamId: string; groups: KeywordGroup[]; onChange: (g: KeywordGroup[]) => void }) {
  const [name, setName] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await keywordsApi.createGroup(teamId, name.trim());
    setName("");
    const r = await keywordsApi.groups(teamId);
    onChange(r.groups);
  }
  async function remove(id: string) {
    await keywordsApi.deleteGroup(id);
    const r = await keywordsApi.groups(teamId);
    onChange(r.groups);
  }
  return (
    <div>
      <ul className="divide-y divide-slate-100 mb-3">
        {groups.map((g) => (
          <li key={g.id} className="py-2 flex justify-between text-sm">
            <span>{g.name}</span>
            <button className="btn-danger" onClick={() => remove(g.id)}>삭제</button>
          </li>
        ))}
        {groups.length === 0 && <li className="py-2 text-sm text-slate-400">등록된 키워드그룹이 없습니다.</li>}
      </ul>
      <form onSubmit={add} className="flex gap-3">
        <input className="input" placeholder="새 키워드그룹 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0">추가</button>
      </form>
    </div>
  );
}
