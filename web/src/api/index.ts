import { apiFetch } from "./client";
import type {
  AuthUser, Membership, Team, KeywordGroup, Keyword, Channel, Branch,
  Investigation, TabAnalysis, UploadedImage, DetectedModule, Post, AggregateResult,
} from "../types";

// ---- Auth ----
export const authApi = {
  register: (body: { companyName?: string; companyId?: string; email: string; password: string; name: string }) =>
    apiFetch<{ token: string; user: AuthUser }>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ token: string; user: AuthUser; memberships: Membership[] }>("/auth/login", { method: "POST", body }),
  me: () => apiFetch<{ user: AuthUser; memberships: Membership[] }>("/auth/me"),
};

// ---- Teams ----
export const teamsApi = {
  list: () => apiFetch<{ teams: Team[] }>("/teams"),
  create: (name: string) => apiFetch<{ team: Team }>("/teams", { method: "POST", body: { name } }),
  rename: (teamId: string, name: string) => apiFetch<{ team: Team }>(`/teams/${teamId}`, { method: "PATCH", body: { name } }),
  remove: (teamId: string) => apiFetch<{ ok: true }>(`/teams/${teamId}`, { method: "DELETE" }),
  deleted: () => apiFetch<{ teams: Team[] }>("/teams/deleted"),
  restore: (teamId: string) => apiFetch<{ team: Team }>(`/teams/${teamId}/restore`, { method: "POST" }),
  setDefaults: (teamId: string, body: Partial<Pick<Team, "defaultKeywordGroupId" | "defaultSearchEnv" | "defaultSearchTab">>) =>
    apiFetch(`/teams/${teamId}/defaults`, { method: "PATCH", body }),
  members: (teamId: string) => apiFetch<{ members: any[] }>(`/teams/${teamId}/members`),
  addMember: (teamId: string, email: string, role: "TEAM_ADMIN" | "MEMBER") =>
    apiFetch(`/teams/${teamId}/members`, { method: "POST", body: { email, role } }),
  removeMember: (teamId: string, userId: string) => apiFetch(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
};

// ---- Keywords ----
export const keywordsApi = {
  groups: (teamId: string) => apiFetch<{ groups: KeywordGroup[] }>("/keywords/groups", { query: { teamId } }),
  createGroup: (teamId: string, name: string) => apiFetch<{ group: KeywordGroup }>("/keywords/groups", { method: "POST", body: { teamId, name } }),
  deleteGroup: (id: string) => apiFetch(`/keywords/groups/${id}`, { method: "DELETE" }),
  list: (teamId: string) => apiFetch<{ keywords: Keyword[] }>("/keywords", { query: { teamId } }),
  create: (teamId: string, text: string, keywordGroupId?: string | null) =>
    apiFetch<{ keyword: Keyword }>("/keywords", { method: "POST", body: { teamId, text, keywordGroupId } }),
  searchVolume: (teamId: string, yearMonth?: string) =>
    apiFetch<{ entries: any[] }>("/keywords/search-volume", { query: { teamId, yearMonth } }),
  upsertVolume: (body: { teamId: string; keywordId: string; yearMonth: string; volume: number; source?: "MANUAL" | "EXCEL" }) =>
    apiFetch("/keywords/search-volume", { method: "PUT", body }),
};

// ---- Channels ----
export const channelsApi = {
  list: (params: Record<string, string | undefined>) => apiFetch<{ channels: Channel[] }>("/channels", { query: params }),
  create: (body: Partial<Channel> & { platform: string; exposedName: string }) =>
    apiFetch<{ channel: Channel }>("/channels", { method: "POST", body }),
  update: (id: string, body: Partial<Channel>) => apiFetch<{ channel: Channel }>(`/channels/${id}`, { method: "PATCH", body }),
  setActive: (id: string, active: boolean) => apiFetch(`/channels/${id}/active`, { method: "POST", body: { active } }),
  addAlias: (id: string, alias: string) => apiFetch(`/channels/${id}/aliases`, { method: "POST", body: { alias } }),
  removeAlias: (id: string, aliasId: string) => apiFetch(`/channels/${id}/aliases/${aliasId}`, { method: "DELETE" }),
  branches: () => apiFetch<{ branches: Branch[] }>("/channels/branches"),
  createBranch: (name: string) => apiFetch<{ branch: Branch }>("/channels/branches", { method: "POST", body: { name } }),
  brands: () => apiFetch<{ brands: any[] }>("/channels/brands"),
  createBrand: (name: string) => apiFetch("/channels/brands", { method: "POST", body: { name } }),
  competitors: () => apiFetch<{ competitors: any[] }>("/channels/competitors"),
  createCompetitor: (name: string) => apiFetch("/channels/competitors", { method: "POST", body: { name } }),
  exportAll: () => apiFetch<{ channels: Channel[] }>("/channels/export"),
  importRows: (rows: any[]) => apiFetch<{ created: number; skipped: number }>("/channels/import", { method: "POST", body: { rows } }),
  retroPreview: (id: string) => apiFetch<{ affectedPostCount: number }>(`/channels/${id}/retroactive-preview`),
  retroApply: (id: string) => apiFetch<{ updatedCount: number }>(`/channels/${id}/retroactive-apply`, { method: "POST" }),
};

// ---- Investigations ----
export const investigationsApi = {
  create: (body: {
    teamId: string; keywordText: string; keywordGroupId?: string | null; investigationDate: string;
    searchEnvironment: string; tabsRequested: string; saveAsTeamDefault?: boolean;
  }) => apiFetch<{ investigation: Investigation; tabAnalyses: TabAnalysis[]; reusedExisting: boolean }>("/investigations", { method: "POST", body }),
  list: (params: Record<string, string | undefined>) => apiFetch<{ investigations: Investigation[] }>("/investigations", { query: params }),
  get: (id: string) => apiFetch<{ investigation: Investigation; tabAnalyses: TabAnalysis[] }>(`/investigations/${id}`),
  save: (id: string) => apiFetch<{ investigation: Investigation; tabAnalyses: TabAnalysis[]; alreadySaved?: boolean }>(`/investigations/${id}/save`, { method: "POST" }),
};

// ---- Tab analyses ----
export const tabAnalysesApi = {
  get: (id: string) => apiFetch<{ tabAnalysis: TabAnalysis; images: UploadedImage[]; modules: DetectedModule[]; posts: Post[] }>(`/tab-analyses/${id}`),
  uploadImages: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("images", f);
    return apiFetch<{ images: UploadedImage[] }>(`/tab-analyses/${id}/images`, { method: "POST", body: fd, isFormData: true });
  },
  deleteImage: (id: string, imageId: string) => apiFetch(`/tab-analyses/${id}/images/${imageId}`, { method: "DELETE" }),
  setImageOcrStatus: (id: string, imageId: string, status: string, error?: string) =>
    apiFetch(`/tab-analyses/${id}/images/${imageId}/ocr-status`, { method: "POST", body: { status, error } }),
  submitOcrResults: (id: string, body: { modules: any[]; posts: any[] }) =>
    apiFetch<{ modules: DetectedModule[]; posts: Post[] }>(`/tab-analyses/${id}/ocr-results`, { method: "POST", body }),
  updateModule: (id: string, moduleId: string, body: Partial<DetectedModule>) =>
    apiFetch(`/tab-analyses/${id}/modules/${moduleId}`, { method: "PATCH", body }),
  updatePost: (id: string, postId: string, body: Partial<Post> & { matchedChannelId?: string | null }) =>
    apiFetch<{ post: Post }>(`/tab-analyses/${id}/posts/${postId}`, { method: "PATCH", body }),
  addManualPost: (id: string, body: { exposedChannelName: string; titleText: string; channelTypeGuess: string; groupId?: string | null }) =>
    apiFetch<{ post: Post }>(`/tab-analyses/${id}/posts`, { method: "POST", body }),
  deletePost: (id: string, postId: string) => apiFetch(`/tab-analyses/${id}/posts/${postId}`, { method: "DELETE" }),
  computeTop10: (id: string, excludedGroupIds: string[], excludedChannelTypes: string[] = []) =>
    apiFetch<{ posts: Post[]; tabAnalysis: TabAnalysis }>(`/tab-analyses/${id}/compute-top10`, { method: "POST", body: { excludedGroupIds, excludedChannelTypes } }),
  updateClassification: (id: string, postId: string, body: any) =>
    apiFetch<{ post: Post }>(`/tab-analyses/${id}/posts/${postId}/classification`, { method: "PATCH", body }),
  confirmClassification: (id: string) => apiFetch<{ ok: true }>(`/tab-analyses/${id}/confirm-classification`, { method: "POST" }),
};

// ---- Dashboard ----
export const dashboardApi = {
  get: (params: Record<string, string | undefined>) =>
    apiFetch<{ summary: any; aggregate: AggregateResult; monthOverMonth: any }>("/dashboard", { query: params }),
  savedRecords: (params: Record<string, string | undefined>) => apiFetch<{ records: any[] }>("/dashboard/saved-records", { query: params }),
};

// ---- Reports ----
export const reportsApi = {
  list: (teamId: string) => apiFetch<{ reports: any[] }>("/reports", { query: { teamId } }),
  upsert: (body: any) => apiFetch<{ report: any }>("/reports", { method: "POST", body }),
  get: (id: string) => apiFetch<{ report: any }>(`/reports/${id}`),
  patch: (id: string, body: any) => apiFetch(`/reports/${id}`, { method: "PATCH", body }),
  addComment: (id: string, body: string) => apiFetch(`/reports/${id}/comments`, { method: "POST", body: { body } }),
  importSearchVolume: (teamId: string, yearMonth: string, file: File) => {
    const fd = new FormData();
    fd.append("teamId", teamId);
    fd.append("yearMonth", yearMonth);
    fd.append("file", file);
    return apiFetch<{ created: number; updated: number; errors: string[] }>("/reports/search-volume/import", {
      method: "POST",
      body: fd,
      isFormData: true,
    });
  },
};

// ---- Public demo ----
export const publicApi = {
  dashboard: (yearMonth?: string) => apiFetch<{ isSample: true; aggregate: AggregateResult; monthOverMonth: any }>("/public/dashboard", { query: { yearMonth } }),
};
