export type SiteCode = "CEDIS" | "ACUNA" | "NLD";

export type AppRole =
  | "admin"
  | "operaciones"
  | "almacen_cedis"
  | "almacen_acuna"
  | "almacen_nld";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  siteCode: SiteCode;
}

export interface InventoryItem {
  id: string;
  siteCode: SiteCode;
  sku: string;
  description: string;
  size?: string;
  quantity: number;
  recoveredStock: number;
  minStock: number;
  updatedAt: string;
}

export interface Entry {
  id: string;
  siteCode: SiteCode;
  employeeId?: string;
  notes?: string;
  createdAt: string;
}

export interface Dispatch {
  id: string;
  siteCode: SiteCode;
  employeeId: string;
  proofUrl?: string;
  createdAt: string;
}

export interface Recovery {
  id: string;
  siteCode: SiteCode;
  employeeId: string;
  itemId?: string;
  recoveredQty?: number;
  applyToInventory?: boolean;
  reason: string;
  createdAt: string;
}

export interface Change {
  id: string;
  siteCode: SiteCode;
  employeeId: string;
  reason: string;
  evidenceUrl?: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  siteCode: SiteCode;
  pendingCount: number;
}

export interface PendingTask {
  id: string;
  employeeId: string;
  siteCode: SiteCode;
  title: string;
  status: "open" | "completed";
}

export interface Order {
  id: string;
  siteCode: SiteCode;
  orderNumber: string;
  requestedBy: string;
  status: "draft" | "approved" | "sent";
  createdAt: string;
}

export interface CyclicInventory {
  id: string;
  siteCode: SiteCode;
  itemId: string;
  systemQty: number;
  countedQty: number;
  status: "pending" | "reconciled";
  countedAt: string;
}
