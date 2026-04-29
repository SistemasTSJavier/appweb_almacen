import type { SiteCode } from "../types/models";
import { supabase } from "../lib/supabase";
import { writeAuditLog } from "./audit-service";

export interface PurchaseOrderItem {
  inventoryItemId: string;
  sku: string;
  description: string;
  quantity: number;
  reason: string;
}

export interface PurchaseOrderDraft {
  id: string;
  orderNumber: string;
  siteCode: SiteCode;
  requestedBy: string;
  title: string;
  createdAt: string;
  items: PurchaseOrderItem[];
}

const storageKey = "app_almacen_purchase_orders";

function readDrafts(): PurchaseOrderDraft[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PurchaseOrderDraft[];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: PurchaseOrderDraft[]) {
  localStorage.setItem(storageKey, JSON.stringify(drafts));
}

export async function listPurchaseOrders(): Promise<PurchaseOrderDraft[]> {
  if (!supabase) {
    return readDrafts().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data: orders, error } = await supabase
    .from("purchase_orders")
    .select("id,order_number,site_code,requested_by,title,created_at,purchase_order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (orders ?? []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    siteCode: order.site_code,
    requestedBy: order.requested_by,
    title: order.title,
    createdAt: order.created_at,
    items: (order.purchase_order_items ?? []).map((item: any) => ({
      inventoryItemId: item.inventory_item_id ?? "",
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      reason: item.reason,
    })),
  }));
}

export async function createPurchaseOrderDraft(
  payload: Omit<PurchaseOrderDraft, "id" | "createdAt" | "orderNumber">,
): Promise<PurchaseOrderDraft> {
  if (!supabase) {
    const drafts = readDrafts();
    const next = drafts.length + 1;
    const orderNumber = `PED-${new Date().getFullYear()}-${String(next).padStart(4, "0")}`;
    const draft: PurchaseOrderDraft = {
      id: `po-${Date.now()}`,
      createdAt: new Date().toISOString(),
      orderNumber,
      ...payload,
    };
    drafts.unshift(draft);
    writeDrafts(drafts);
    return draft;
  }

  const current = await listPurchaseOrders();
  const next = current.length + 1;
  const orderNumber = `PED-${new Date().getFullYear()}-${String(next).padStart(4, "0")}`;

  const { data: order, error } = await supabase
    .from("purchase_orders")
    .insert({
      order_number: orderNumber,
      site_code: payload.siteCode,
      requested_by: payload.requestedBy,
      title: payload.title,
    })
    .select("id,created_at")
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    payload.items.map((item) => ({
      purchase_order_id: order.id,
      inventory_item_id: item.inventoryItemId || null,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      reason: item.reason,
    })),
  );
  if (itemsError) throw itemsError;

  await writeAuditLog({
    tableName: "purchase_orders",
    recordId: order.id,
    action: "create",
    after: { ...payload, orderNumber },
  });

  return {
    id: order.id,
    createdAt: order.created_at,
    orderNumber,
    ...payload,
  };
}
