import type { SiteCode } from "../types/models";
import { supabase } from "../lib/supabase";
import { writeAuditLog } from "./audit-service";

export interface CyclicTaskItem {
  itemId: string;
  sku: string;
  description: string;
  systemQty: number;
  countedQty?: number;
}

export interface CyclicTask {
  id: string;
  siteCode: SiteCode;
  weekKey: string;
  createdAt: string;
  createdBy: string;
  status: "pending" | "completed";
  items: CyclicTaskItem[];
}

const storageKey = "app_almacen_cyclic_tasks";

function readTasks(): CyclicTask[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CyclicTask[];
  } catch {
    return [];
  }
}

function writeTasks(tasks: CyclicTask[]) {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

export async function listCyclicTasks(): Promise<CyclicTask[]> {
  if (!supabase) {
    return readTasks().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { data, error } = await supabase
    .from("cyclic_tasks")
    .select("id,site_code,week_key,created_at,created_by,status,cyclic_task_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    siteCode: row.site_code,
    weekKey: row.week_key,
    createdAt: row.created_at,
    createdBy: row.created_by,
    status: row.status,
    items: (row.cyclic_task_items ?? []).map((item: any) => ({
      itemId: item.item_id ?? "",
      sku: item.sku,
      description: item.description,
      systemQty: item.system_qty,
      countedQty: item.counted_qty ?? undefined,
    })),
  }));
}

export async function createCyclicTask(payload: Omit<CyclicTask, "id" | "createdAt" | "status">): Promise<CyclicTask> {
  if (!supabase) {
    const tasks = readTasks();
    const next: CyclicTask = {
      id: `ct-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "pending",
      ...payload,
    };
    tasks.unshift(next);
    writeTasks(tasks);
    return next;
  }

  const { data: task, error } = await supabase
    .from("cyclic_tasks")
    .insert({
      site_code: payload.siteCode,
      week_key: payload.weekKey,
      created_by: payload.createdBy,
      status: "pending",
    })
    .select("id,created_at,status")
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("cyclic_task_items").insert(
    payload.items.map((item) => ({
      cyclic_task_id: task.id,
      item_id: item.itemId || null,
      sku: item.sku,
      description: item.description,
      system_qty: item.systemQty,
      counted_qty: item.countedQty ?? null,
    })),
  );
  if (itemsError) throw itemsError;

  const created: CyclicTask = {
    id: task.id,
    createdAt: task.created_at,
    status: task.status,
    ...payload,
  };
  await writeAuditLog({
    tableName: "cyclic_tasks",
    recordId: task.id,
    action: "create",
    after: created,
  });
  return created;
}

export async function saveCyclicTask(task: CyclicTask): Promise<void> {
  if (!supabase) {
    const tasks = readTasks();
    const idx = tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) tasks[idx] = task;
    else tasks.unshift(task);
    writeTasks(tasks);
    return;
  }

  const { error } = await supabase
    .from("cyclic_tasks")
    .update({ status: task.status })
    .eq("id", task.id);
  if (error) throw error;

  for (const item of task.items) {
    if (!item.itemId) continue;
    const { error: itemError } = await supabase
      .from("cyclic_task_items")
      .update({ counted_qty: item.countedQty ?? null })
      .eq("cyclic_task_id", task.id)
      .eq("item_id", item.itemId);
    if (itemError) throw itemError;
  }

  await writeAuditLog({
    tableName: "cyclic_tasks",
    recordId: task.id,
    action: "update",
    after: task,
  });
}

export async function deleteCyclicTask(taskId: string): Promise<void> {
  if (!supabase) {
    const next = readTasks().filter((task) => task.id !== taskId);
    writeTasks(next);
    return;
  }

  const { error } = await supabase.from("cyclic_tasks").delete().eq("id", taskId);
  if (error) throw error;

  await writeAuditLog({
    tableName: "cyclic_tasks",
    recordId: taskId,
    action: "delete",
  });
}
