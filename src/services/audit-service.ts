import { supabase } from "../lib/supabase";

interface AuditPayload {
  tableName: string;
  recordId: string;
  action: string;
  actorId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("audit_logs").insert({
    table_name: payload.tableName,
    record_id: payload.recordId,
    action: payload.action,
    actor_id: payload.actorId ?? null,
    payload: {
      before: payload.before ?? null,
      after: payload.after ?? null,
      meta: payload.meta ?? {},
    },
  });
  if (error) {
    // Do not block main flow for audit failures.
    console.warn("audit log failed", error.message);
  }
}
