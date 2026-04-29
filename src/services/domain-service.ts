import { formatISO } from "date-fns";
import { supabase } from "../lib/supabase";
import { writeAuditLog } from "./audit-service";
import type {
  Change,
  CyclicInventory,
  Dispatch,
  Employee,
  Entry,
  InventoryItem,
  Order,
  PendingTask,
  Recovery,
  SiteCode,
} from "../types/models";

const now = () => formatISO(new Date());

const mockInventory: InventoryItem[] = [
  {
    id: "1",
    siteCode: "CEDIS",
    sku: "BOT-001",
    description: "Bota tactica",
    size: "27",
    quantity: 50,
    recoveredStock: 4,
    minStock: 20,
    updatedAt: now(),
  },
  {
    id: "2",
    siteCode: "ACUNA",
    sku: "UNI-002",
    description: "Uniforme operativo",
    size: "M",
    quantity: 32,
    recoveredStock: 3,
    minStock: 18,
    updatedAt: now(),
  },
  {
    id: "3",
    siteCode: "NLD",
    sku: "CAS-003",
    description: "Casco seguridad",
    quantity: 21,
    recoveredStock: 1,
    minStock: 10,
    updatedAt: now(),
  },
];

const mockEmployees: Employee[] = [
  { id: "emp-1", employeeCode: "E001", fullName: "Juan Perez", siteCode: "CEDIS", pendingCount: 2 },
  { id: "emp-2", employeeCode: "E002", fullName: "Maria Lopez", siteCode: "ACUNA", pendingCount: 1 },
];

const mockPending: PendingTask[] = [
  { id: "p1", employeeId: "emp-1", siteCode: "CEDIS", title: "Validar salida 125", status: "open" },
  { id: "p2", employeeId: "emp-2", siteCode: "ACUNA", title: "Completar recuperacion", status: "open" },
];

const mockOrders: Order[] = [
  { id: "o1", siteCode: "CEDIS", orderNumber: "PED-2026-001", requestedBy: "Juan Perez", status: "draft", createdAt: now() },
];

const mockEntries: Entry[] = [];
const mockDispatches: Dispatch[] = [];
const mockRecoveries: Recovery[] = [];
const mockChanges: Change[] = [];

const mockCyclic: CyclicInventory[] = [
  { id: "c1", siteCode: "CEDIS", itemId: "1", systemQty: 50, countedQty: 48, status: "pending", countedAt: now() },
];

export async function listInventory(siteCode?: SiteCode): Promise<InventoryItem[]> {
  if (!supabase) return siteCode ? mockInventory.filter((i) => i.siteCode === siteCode) : mockInventory;
  let query = supabase.from("inventory_items").select("*").order("updated_at", { ascending: false });
  if (siteCode) query = query.eq("site_code", siteCode);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    sku: row.sku,
    description: row.description,
    size: row.size ?? undefined,
    quantity: row.quantity,
    recoveredStock: row.recovered_stock ?? 0,
    minStock: row.min_stock,
    updatedAt: row.updated_at,
  }));
}

export async function upsertInventory(payload: Partial<InventoryItem>): Promise<void> {
  if (!supabase) {
    const existingIndex = mockInventory.findIndex((item) => item.id === payload.id);
    if (existingIndex >= 0) {
      mockInventory[existingIndex] = {
        ...mockInventory[existingIndex],
        ...payload,
        id: mockInventory[existingIndex].id,
        updatedAt: now(),
        recoveredStock: payload.recoveredStock ?? mockInventory[existingIndex].recoveredStock,
      } as InventoryItem;
      return;
    }
    mockInventory.unshift({
      id: `inv-${Date.now()}`,
      siteCode: payload.siteCode ?? "CEDIS",
      sku: payload.sku ?? "SKU-SIN-CLAVE",
      description: payload.description ?? "Item sin descripcion",
      size: payload.size ?? undefined,
      quantity: payload.quantity ?? 0,
      recoveredStock: payload.recoveredStock ?? 0,
      minStock: payload.minStock ?? 0,
      updatedAt: now(),
    });
    return;
  }
  const { error } = await supabase.from("inventory_items").upsert({
    id: payload.id,
    site_code: payload.siteCode,
    sku: payload.sku,
    description: payload.description,
    size: payload.size ?? null,
    quantity: payload.quantity,
    recovered_stock: payload.recoveredStock,
    min_stock: payload.minStock,
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "inventory_items",
    recordId: payload.id ?? "new",
    action: payload.id ? "update" : "create",
    after: payload,
  });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (!supabase) {
    const index = mockInventory.findIndex((item) => item.id === id);
    if (index >= 0) mockInventory.splice(index, 1);
    return;
  }
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

export async function listEmployees(): Promise<Employee[]> {
  if (!supabase) return mockEmployees;
  const { data, error } = await supabase.from("employees").select("*");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    siteCode: row.site_code,
    pendingCount: row.pending_count,
  }));
}

export async function ensureEmployee(payload: {
  employeeCode: string;
  fullName: string;
  siteCode: SiteCode;
}): Promise<Employee> {
  const employeeCode = payload.employeeCode.trim();
  const fullName = payload.fullName.trim();
  if (!employeeCode || !fullName) {
    throw new Error("employeeCode y fullName son obligatorios para crear empleado.");
  }

  if (!supabase) {
    const existing = mockEmployees.find((emp) => emp.employeeCode.toLowerCase() === employeeCode.toLowerCase());
    if (existing) return existing;
    const created: Employee = {
      id: `emp-${Date.now()}`,
      employeeCode,
      fullName,
      siteCode: payload.siteCode,
      pendingCount: 0,
    };
    mockEmployees.unshift(created);
    return created;
  }

  const { data: existing, error: findError } = await supabase
    .from("employees")
    .select("*")
    .eq("employee_code", employeeCode)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    return {
      id: existing.id,
      employeeCode: existing.employee_code,
      fullName: existing.full_name,
      siteCode: existing.site_code,
      pendingCount: existing.pending_count,
    };
  }

  const { data: created, error: createError } = await supabase
    .from("employees")
    .insert({
      employee_code: employeeCode,
      full_name: fullName,
      site_code: payload.siteCode,
      pending_count: 0,
    })
    .select("*")
    .single();
  if (createError) throw createError;

  return {
    id: created.id,
    employeeCode: created.employee_code,
    fullName: created.full_name,
    siteCode: created.site_code,
    pendingCount: created.pending_count,
  };
}

export async function deleteEmployee(id: string): Promise<void> {
  if (!supabase) {
    const index = mockEmployees.findIndex((emp) => emp.id === id);
    if (index >= 0) mockEmployees.splice(index, 1);
    return;
  }
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}

export async function updateEmployeeCode(employeeId: string, employeeCode: string): Promise<void> {
  const normalizedCode = employeeCode.trim();
  if (!normalizedCode) throw new Error("El ID colaborador no puede ir vacio.");

  if (!supabase) {
    const existingByCode = mockEmployees.find(
      (emp) => emp.employeeCode.toLowerCase() === normalizedCode.toLowerCase() && emp.id !== employeeId,
    );
    if (existingByCode) throw new Error("Ese ID colaborador ya existe.");
    const index = mockEmployees.findIndex((emp) => emp.id === employeeId);
    if (index < 0) throw new Error("Empleado no encontrado.");
    mockEmployees[index] = { ...mockEmployees[index], employeeCode: normalizedCode };
    return;
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("employees")
    .select("id")
    .eq("employee_code", normalizedCode)
    .neq("id", employeeId)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new Error("Ese ID colaborador ya existe.");

  const { error } = await supabase
    .from("employees")
    .update({ employee_code: normalizedCode })
    .eq("id", employeeId);
  if (error) throw error;
}

export async function listPendingTasks(): Promise<PendingTask[]> {
  if (!supabase) return mockPending;
  const { data, error } = await supabase.from("pending_tasks").select("*").eq("status", "open");
  if (error) throw error;
  return data;
}

export async function listOrders(): Promise<Order[]> {
  if (!supabase) return mockOrders;
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    orderNumber: row.order_number,
    requestedBy: row.requested_by,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function listEntries(): Promise<Entry[]> {
  if (!supabase) return mockEntries;
  const { data, error } = await supabase.from("entries").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    employeeId: row.employee_id,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function listDispatches(): Promise<Dispatch[]> {
  if (!supabase) return mockDispatches;
  const { data, error } = await supabase.from("dispatches").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    employeeId: row.employee_id,
    proofUrl: row.proof_url ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function listRecoveries(): Promise<Recovery[]> {
  if (!supabase) return mockRecoveries;
  const { data, error } = await supabase.from("recoveries").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    employeeId: row.employee_id,
    reason: row.reason,
    evidenceUrl: row.evidence_url ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function listChanges(): Promise<Change[]> {
  if (!supabase) return mockChanges;
  const { data, error } = await supabase.from("changes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    employeeId: row.employee_id,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export async function createEntry(payload: Omit<Entry, "id" | "createdAt">): Promise<void> {
  if (!supabase) {
    mockEntries.unshift({ id: `entry-${Date.now()}`, ...payload, createdAt: now() });
    return;
  }
  const { error } = await supabase.from("entries").insert({
    site_code: payload.siteCode,
    employee_id: payload.employeeId,
    notes: payload.notes ?? null,
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "entries",
    recordId: `${payload.siteCode}-${Date.now()}`,
    action: "create",
    after: payload,
  });
}

export async function deleteEntry(id: string): Promise<void> {
  if (!supabase) {
    const index = mockEntries.findIndex((row) => row.id === id);
    if (index >= 0) mockEntries.splice(index, 1);
    return;
  }
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

export async function createDispatch(payload: Omit<Dispatch, "id" | "createdAt">): Promise<void> {
  if (!supabase) {
    mockDispatches.unshift({ id: `dispatch-${Date.now()}`, ...payload, createdAt: now() });
    return;
  }
  const { error } = await supabase.from("dispatches").insert({
    site_code: payload.siteCode,
    employee_id: payload.employeeId,
    proof_url: payload.proofUrl ?? null,
    evidence_url: payload.proofUrl ?? null,
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "dispatches",
    recordId: `${payload.siteCode}-${Date.now()}`,
    action: "create",
    after: payload,
  });
}

export async function deleteDispatch(id: string): Promise<void> {
  if (!supabase) {
    const index = mockDispatches.findIndex((row) => row.id === id);
    if (index >= 0) mockDispatches.splice(index, 1);
    return;
  }
  const { error } = await supabase.from("dispatches").delete().eq("id", id);
  if (error) throw error;
}

export async function createRecovery(payload: Omit<Recovery, "id" | "createdAt">): Promise<void> {
  if (!supabase) {
    mockRecoveries.unshift({ id: `recovery-${Date.now()}`, ...payload, createdAt: now() });
    return;
  }
  const { error } = await supabase.from("recoveries").insert({
    site_code: payload.siteCode,
    employee_id: payload.employeeId,
    reason: payload.reason,
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "recoveries",
    recordId: `${payload.siteCode}-${Date.now()}`,
    action: "create",
    after: payload,
  });
}

export async function createChange(payload: Omit<Change, "id" | "createdAt">): Promise<void> {
  if (!supabase) {
    mockChanges.unshift({ id: `change-${Date.now()}`, ...payload, createdAt: now() });
    return;
  }
  const { error } = await supabase.from("changes").insert({
    site_code: payload.siteCode,
    employee_id: payload.employeeId,
    reason: payload.reason,
    evidence_url: payload.evidenceUrl ?? null,
  });
  if (error) throw error;
  await writeAuditLog({
    tableName: "changes",
    recordId: `${payload.siteCode}-${Date.now()}`,
    action: "create",
    after: payload,
  });
}

export async function listCyclicInventory(): Promise<CyclicInventory[]> {
  if (!supabase) return mockCyclic;
  const { data, error } = await supabase.from("cyclic_inventories").select("*").order("counted_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    siteCode: row.site_code,
    itemId: row.item_id,
    systemQty: row.system_qty,
    countedQty: row.counted_qty,
    status: row.status,
    countedAt: row.counted_at,
  }));
}
