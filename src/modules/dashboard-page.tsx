import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import {
  listChanges,
  listDispatches,
  listEntries,
  listInventory,
  listRecoveries,
} from "../services/domain-service";
import { listPurchaseOrders } from "../services/purchase-order-service";
import { listCyclicTasks } from "../services/cyclic-task-service";
import { listCollaboratorProfiles } from "../services/collaborator-profile-service";
import { useSessionStore } from "../state/use-session-store";
import type { SiteCode } from "../types/models";

const sites: SiteCode[] = ["CEDIS", "ACUNA", "NLD"];

function isThisWeek(value: string) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1);
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

export function DashboardPage() {
  const dashboardRef = useRef<HTMLElement | null>(null);
  const user = useSessionStore((s) => s.currentUser);
  const isAdmin = user?.role === "admin";
  const defaultSite: SiteCode = user?.siteCode ?? "CEDIS";
  const inventory = useQuery({
    queryKey: ["dashboard-inventory", isAdmin, defaultSite],
    queryFn: async () => {
      if (!isAdmin) return listInventory(defaultSite);
      const chunks = await Promise.all(sites.map((site) => listInventory(site)));
      const byId = new Map(chunks.flat().map((item) => [item.id, item]));
      return Array.from(byId.values());
    },
  });
  const entries = useQuery({ queryKey: ["entries"], queryFn: listEntries });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: listDispatches });
  const recoveries = useQuery({ queryKey: ["recoveries"], queryFn: listRecoveries });
  const changes = useQuery({ queryKey: ["changes"], queryFn: listChanges });
  const purchaseOrdersQuery = useQuery({ queryKey: ["purchase-orders"], queryFn: listPurchaseOrders });
  const cyclicTasksQuery = useQuery({ queryKey: ["cyclic-tasks"], queryFn: listCyclicTasks });
  const collaboratorProfilesQuery = useQuery({
    queryKey: ["collaborator-profiles"],
    queryFn: listCollaboratorProfiles,
  });

  const isLoading =
    inventory.isLoading ||
    entries.isLoading ||
    dispatches.isLoading ||
    recoveries.isLoading ||
    changes.isLoading ||
    purchaseOrdersQuery.isLoading ||
    cyclicTasksQuery.isLoading ||
    collaboratorProfilesQuery.isLoading;

  const hasError =
    inventory.isError ||
    entries.isError ||
    dispatches.isError ||
    recoveries.isError ||
    changes.isError ||
    purchaseOrdersQuery.isError ||
    cyclicTasksQuery.isError ||
    collaboratorProfilesQuery.isError;

  const purchaseOrders = purchaseOrdersQuery.data ?? [];
  const cyclicTasks = cyclicTasksQuery.data ?? [];
  const collaboratorProfiles = collaboratorProfilesQuery.data ?? [];

  const inventoryRows = inventory.data ?? [];
  const [siteFilter, setSiteFilter] = useState<"ALL" | SiteCode>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const inRange = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return true;
    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`);
      if (date < from) return false;
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59`);
      if (date > to) return false;
    }
    return true;
  };

  const filteredInventoryRows = useMemo(
    () => inventoryRows.filter((item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter)),
    [inventoryRows, siteFilter],
  );
  const filteredDispatches = (dispatches.data ?? []).filter(
    (item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter) && inRange(item.createdAt),
  );
  const filteredRecoveries = (recoveries.data ?? []).filter(
    (item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter) && inRange(item.createdAt),
  );
  const filteredChanges = (changes.data ?? []).filter(
    (item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter) && inRange(item.createdAt),
  );
  const filteredEntries = (entries.data ?? []).filter(
    (item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter) && inRange(item.createdAt),
  );
  const filteredOrders = purchaseOrders.filter(
    (item) => (siteFilter === "ALL" ? true : item.siteCode === siteFilter) && inRange(item.createdAt),
  );
  const filteredCyclicTasks = cyclicTasks.filter(
    (task) => (siteFilter === "ALL" ? true : task.siteCode === siteFilter) && inRange(task.createdAt),
  );
  const filteredCollaborators = collaboratorProfiles.filter((profile) =>
    siteFilter === "ALL" ? true : profile.siteCode === siteFilter,
  );

  const lowStockRows = filteredInventoryRows.filter((item) => item.quantity <= item.minStock);
  const activeCollaborators = filteredCollaborators.length;
  const weeklyDispatches = filteredDispatches.filter((item) => isThisWeek(item.createdAt));
  const weeklyRecoveries = filteredRecoveries.filter((item) => isThisWeek(item.createdAt));
  const weeklyChanges = filteredChanges.filter((item) => isThisWeek(item.createdAt));
  const weeklyEntries = filteredEntries.filter((item) => isThisWeek(item.createdAt));

  const healthBySite = sites.map((site) => {
    const siteItems = filteredInventoryRows.filter((item) => item.siteCode === site);
    const critical = siteItems.filter((item) => item.quantity <= item.minStock).length;
    const total = siteItems.length || 1;
    const compliance = Math.round(((total - critical) / total) * 100);
    return { site, critical, total: siteItems.length, compliance };
  });

  const topCritical = [...lowStockRows]
    .sort((a, b) => (b.minStock - b.quantity) - (a.minStock - a.quantity))
    .slice(0, 8);

  const cyclicSummary = {
    total: filteredCyclicTasks.length,
    completed: filteredCyclicTasks.filter((task) => task.status === "completed").length,
    thisWeek: filteredCyclicTasks.filter((task) => isThisWeek(task.createdAt)).length,
    discrepancies: filteredCyclicTasks.reduce(
      (acc, task) =>
        acc +
        task.items.filter((item) => item.countedQty !== undefined && item.countedQty !== item.systemQty).length,
      0,
    ),
  };

  const nextRenewals = [...filteredCollaborators]
    .map((profile) => {
      const baseDate = new Date(profile.lastRenewalDate || profile.hireDate);
      const next = new Date(baseDate);
      while (next <= new Date()) next.setMonth(next.getMonth() + 6);
      return { ...profile, nextRenewal: next };
    })
    .sort((a, b) => a.nextRenewal.getTime() - b.nextRenewal.getTime())
    .slice(0, 6);

  const exportDashboardImage = async () => {
    if (!dashboardRef.current) return;
    const canvas = await html2canvas(dashboardRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });
    const image = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = `dashboard-ejecutivo-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  };

  return (
    <section ref={dashboardRef}>
      <h1>Dashboard Ejecutivo</h1>
      {isLoading ? <p className="status-message">Cargando indicadores ejecutivos...</p> : null}
      {hasError ? <p className="error">No fue posible cargar algun bloque del dashboard.</p> : null}
      <div className="row">
        <button type="button" onClick={() => void exportDashboardImage()}>
          Exportar dashboard como imagen
        </button>
      </div>

      <div className="kpi-grid">
        <article className="card kpi-card"><h3>SKUs activos</h3><p>{filteredInventoryRows.length}</p></article>
        <article className="card kpi-card"><h3>Colaboradores activos</h3><p>{activeCollaborators}</p></article>
        <article className="card kpi-card"><h3>Stock critico</h3><p>{lowStockRows.length}</p></article>
        <article className="card kpi-card"><h3>Salidas semana</h3><p>{weeklyDispatches.length}</p></article>
        <article className="card kpi-card"><h3>Recuperaciones semana</h3><p>{weeklyRecoveries.length}</p></article>
        <article className="card kpi-card"><h3>Pedidos registrados</h3><p>{filteredOrders.length}</p></article>
      </div>

      <article className="card">
        <h3>Filtros globales</h3>
        <div className="inventory-form-grid">
          <label className="form-field">
            <span>Sitio</span>
            <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value as "ALL" | SiteCode)}>
              <option value="ALL">Todos</option>
              {sites.map((site) => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Desde</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Hasta</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
      </article>

      <div className="grid">
        <article className="card">
          <h3>Salud por almacen</h3>
          <table className="table">
            <thead><tr><th>Sitio</th><th>SKUs</th><th>Criticos</th><th>Cumplimiento</th></tr></thead>
            <tbody>
              {healthBySite.map((site) => (
                <tr key={site.site}>
                  <td>{site.site}</td>
                  <td>{site.total}</td>
                  <td>{site.critical}</td>
                  <td>{site.compliance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h3>Operacion semanal</h3>
          <table className="table">
            <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
            <tbody>
              <tr><td>Entradas registradas</td><td>{weeklyEntries.length}</td></tr>
              <tr><td>Salidas registradas</td><td>{weeklyDispatches.length}</td></tr>
              <tr><td>Recuperaciones registradas</td><td>{weeklyRecoveries.length}</td></tr>
              <tr><td>Cambios por dano</td><td>{weeklyChanges.length}</td></tr>
            </tbody>
          </table>
        </article>
      </div>

      <div className="grid">
        <article className="card">
          <h3>Top SKUs criticos</h3>
          <table className="table">
            <thead><tr><th>SKU</th><th>Descripcion</th><th>Sitio</th><th>Stock</th><th>Min</th><th>Faltante</th></tr></thead>
            <tbody>
              {topCritical.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.description}</td>
                  <td>{item.siteCode}</td>
                  <td>{item.quantity}</td>
                  <td>{item.minStock}</td>
                  <td>{Math.max(item.minStock - item.quantity, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h3>Conteo ciclico</h3>
          <p>Total tareas: {cyclicSummary.total}</p>
          <p>Completadas: {cyclicSummary.completed}</p>
          <p>Generadas esta semana: {cyclicSummary.thisWeek}</p>
          <p>Diferencias detectadas: {cyclicSummary.discrepancies}</p>
          <h4>Ultimas tareas</h4>
          <ul>
            {filteredCyclicTasks.slice(0, 5).map((task) => (
              <li key={task.id}>
                {task.siteCode} | {new Date(task.createdAt).toLocaleString()} | {task.status}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="grid">
        <article className="card">
          <h3>Proximas renovaciones (6 meses)</h3>
          <table className="table">
            <thead><tr><th>Colaborador</th><th>ID</th><th>Sitio</th><th>Servicio</th><th>Renovacion</th></tr></thead>
            <tbody>
              {nextRenewals.map((profile) => (
                <tr key={profile.employeeId}>
                  <td>{profile.fullName}</td>
                  <td>{profile.employeeCode}</td>
                  <td>{profile.siteCode}</td>
                  <td>{profile.service || "-"}</td>
                  <td>{profile.nextRenewal.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card">
          <h3>Alertas clave</h3>
          <ul>
            {lowStockRows.slice(0, 3).map((item) => (
              <li key={item.id}>
                Critico: {item.sku} ({item.siteCode}) - stock {item.quantity} / min {item.minStock}
              </li>
            ))}
            {cyclicSummary.discrepancies > 0 ? (
              <li>Conteo ciclico con diferencias acumuladas: {cyclicSummary.discrepancies}</li>
            ) : null}
            {filteredOrders.length === 0 ? (
              <li>No hay pedidos registrados aun.</li>
            ) : (
              <li>Ultimo pedido: {filteredOrders[0].orderNumber} ({filteredOrders[0].siteCode})</li>
            )}
          </ul>
        </article>
      </div>
    </section>
  );
}
