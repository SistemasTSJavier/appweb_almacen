import type { SiteCode } from "../types/models";
import { supabase } from "../lib/supabase";
import { writeAuditLog } from "./audit-service";

export interface CollaboratorProfile {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  siteCode: SiteCode;
  service: string;
  position: string;
  hireDate: string;
  lastRenewalDate?: string;
  shirtSize?: string;
  pantsSize?: string;
  shoeSize?: string;
}

export interface CollaboratorHistoryEvent {
  id: string;
  employeeId: string;
  siteCode: SiteCode;
  type: "salida" | "cambio";
  itemLabel: string;
  size?: string;
  quantity: number;
  createdAt: string;
  note?: string;
}

const profilesKey = "app_almacen_collaborator_profiles";
const historyKey = "app_almacen_collaborator_history";

function readJson<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export async function listCollaboratorProfiles(): Promise<CollaboratorProfile[]> {
  if (!supabase) return readJson<CollaboratorProfile>(profilesKey);

  const { data, error } = await supabase
    .from("collaborator_profiles")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    employeeId: row.employee_id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    siteCode: row.site_code,
    service: row.service,
    position: row.position ?? "",
    hireDate: row.hire_date,
    lastRenewalDate: row.last_renewal_date ?? undefined,
    shirtSize: row.shirt_size ?? undefined,
    pantsSize: row.pants_size ?? undefined,
    shoeSize: row.shoe_size ?? undefined,
  }));
}

export async function upsertCollaboratorProfile(profile: CollaboratorProfile): Promise<void> {
  if (!supabase) {
    const current = readJson<CollaboratorProfile>(profilesKey);
    const index = current.findIndex((item) => item.employeeId === profile.employeeId);
    if (index >= 0) current[index] = profile;
    else current.unshift(profile);
    writeJson(profilesKey, current);
    return;
  }

  const { error } = await supabase.from("collaborator_profiles").upsert({
    employee_id: profile.employeeId,
    employee_code: profile.employeeCode,
    full_name: profile.fullName,
    site_code: profile.siteCode,
    service: profile.service,
    position: profile.position,
    hire_date: profile.hireDate,
    last_renewal_date: profile.lastRenewalDate ?? null,
    shirt_size: profile.shirtSize ?? null,
    pants_size: profile.pantsSize ?? null,
    shoe_size: profile.shoeSize ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "collaborator_profiles",
    recordId: profile.employeeId,
    action: "upsert",
    after: profile,
  });
}

export async function deleteCollaboratorProfile(employeeId: string): Promise<void> {
  if (!supabase) {
    const current = readJson<CollaboratorProfile>(profilesKey).filter((item) => item.employeeId !== employeeId);
    writeJson(profilesKey, current);
    return;
  }
  const { error } = await supabase.from("collaborator_profiles").delete().eq("employee_id", employeeId);
  if (error) throw error;
}

export async function listCollaboratorHistory(): Promise<CollaboratorHistoryEvent[]> {
  if (!supabase) return readJson<CollaboratorHistoryEvent>(historyKey);
  const { data, error } = await supabase
    .from("collaborator_history")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    siteCode: row.site_code,
    type: row.type,
    itemLabel: row.item_label,
    size: row.size ?? undefined,
    quantity: row.quantity,
    createdAt: row.created_at,
    note: row.note ?? undefined,
  }));
}

export async function addCollaboratorHistory(
  event: Omit<CollaboratorHistoryEvent, "id" | "createdAt">,
): Promise<void> {
  if (!supabase) {
    const current = readJson<CollaboratorHistoryEvent>(historyKey);
    current.unshift({
      id: `h-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...event,
    });
    writeJson(historyKey, current);
    return;
  }

  const { data, error } = await supabase
    .from("collaborator_history")
    .insert({
      employee_id: event.employeeId,
      site_code: event.siteCode,
      type: event.type,
      item_label: event.itemLabel,
      size: event.size ?? null,
      quantity: event.quantity,
      note: event.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await writeAuditLog({
    tableName: "collaborator_history",
    recordId: data.id,
    action: "create",
    after: event,
  });
}
