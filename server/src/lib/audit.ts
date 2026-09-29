import { db, newId } from "../db";

interface AuditParams {
  entityType: string;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  userId?: string | null;
  teamId?: string | null;
}

function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** 변경 이력 기록. 값이 실제로 달라졌을 때만 기록한다. */
export async function recordAudit(params: AuditParams): Promise<void> {
  const oldS = serialize(params.oldValue);
  const newS = serialize(params.newValue);
  if (oldS === newS) return;
  await db("audit_logs").insert({
    id: newId(),
    entity_type: params.entityType,
    entity_id: params.entityId,
    field: params.field,
    old_value: oldS,
    new_value: newS,
    user_id: params.userId ?? null,
    team_id: params.teamId ?? null,
    created_at: new Date(),
  });
}
