import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInventory } from "../services/domain-service";
import {
  createCyclicTask,
  deleteCyclicTask,
  listCyclicTasks,
  saveCyclicTask,
  type CyclicTask,
  type CyclicTaskItem,
} from "../services/cyclic-task-service";
import { useSessionStore } from "../state/use-session-store";
import type { SiteCode } from "../types/models";

const sites: SiteCode[] = ["CEDIS", "ACUNA", "NLD"];

function getWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function pickRandom<T>(arr: T[], count: number) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function CyclicPage() {
  const user = useSessionStore((s) => s.currentUser);
  const isAdmin = user?.role === "admin";
  const defaultSite = user?.siteCode ?? "CEDIS";
  const [site, setSite] = useState<SiteCode>(defaultSite);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [countByItem, setCountByItem] = useState<Record<string, string>>({});

  const effectiveSite: SiteCode = isAdmin ? site : defaultSite;
  const inventory = useQuery({
    queryKey: ["inventory-cyclic", effectiveSite],
    queryFn: () => listInventory(effectiveSite),
  });
  const tasksQuery = useQuery({ queryKey: ["cyclic-tasks"], queryFn: listCyclicTasks });
  const tasks = tasksQuery.data ?? [];

  const scopedInventory = inventory.data ?? [];
  const scopedTasks = tasks.filter((task) => (isAdmin ? task.siteCode === site : task.siteCode === defaultSite));
  const selectedTask = scopedTasks.find((task) => task.id === selectedTaskId);
  const taskItemTarget = Math.min(15, scopedInventory.length);

  const createTask = async () => {
    setFeedback(null);
    if (!isAdmin) {
      setFeedback("Solo admin puede crear tareas de conteo ciclico.");
      return;
    }
    if (scopedInventory.length === 0) {
      setFeedback("No hay articulos en inventario para generar tarea.");
      return;
    }
    const weekKey = getWeekKey(new Date());
    const createdThisWeek = scopedTasks.filter((task) => task.weekKey === weekKey).length;
    if (createdThisWeek >= 2) {
      setFeedback("Limite semanal alcanzado: maximo 2 tareas por semana.");
      return;
    }

    const items: CyclicTaskItem[] = pickRandom(scopedInventory, taskItemTarget).map((item) => ({
      itemId: item.id,
      sku: item.sku,
      description: item.description,
      systemQty: item.quantity,
    }));
    const task = await createCyclicTask({
      siteCode: site,
      weekKey,
      createdBy: user?.fullName ?? "Admin",
      items,
    });
    setSelectedTaskId(task.id);
    setCountByItem({});
    await tasksQuery.refetch();
    setFeedback(`Tarea de conteo ciclico creada con ${items.length} articulos aleatorios.`);
  };

  const completeTask = async () => {
    if (!selectedTask) return;
    const nextItems = selectedTask.items.map((item) => ({
      ...item,
      countedQty: Number(countByItem[item.itemId] ?? item.countedQty ?? 0),
    }));
    const hasMissing = nextItems.some((item) => Number.isNaN(item.countedQty as number));
    if (hasMissing) {
      setFeedback("Completa cantidades validas para todos los articulos.");
      return;
    }
    const updated: CyclicTask = {
      ...selectedTask,
      status: "completed",
      items: nextItems,
    };
    await saveCyclicTask(updated);
    await tasksQuery.refetch();
    setFeedback("Tarea finalizada y guardada en historial.");
  };

  const removeTask = async (task: CyclicTask) => {
    if (!isAdmin) return;
    const actionLabel = task.status === "pending" ? "cancelar" : "eliminar";
    if (!window.confirm(`¿Deseas ${actionLabel} esta tarea de conteo?`)) return;
    try {
      setFeedback(null);
      await deleteCyclicTask(task.id);
      if (selectedTaskId === task.id) {
        setSelectedTaskId("");
        setCountByItem({});
      }
      await tasksQuery.refetch();
      setFeedback(task.status === "pending" ? "Tarea cancelada." : "Tarea eliminada del historial.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar la tarea.");
    }
  };

  const discrepancyCount = selectedTask
    ? selectedTask.items.filter((item) => item.countedQty !== undefined && item.countedQty !== item.systemQty).length
    : 0;

  return (
    <section>
      <h1>Conteo ciclico</h1>
      {feedback ? <p className="status-message">{feedback}</p> : null}

      <article className="card">
        <div className="row">
          <label className="form-field">
            <span>Sitio</span>
            <select value={site} onChange={(e) => setSite(e.target.value as SiteCode)} disabled={!isAdmin}>
              {sites.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={createTask} disabled={!isAdmin || taskItemTarget === 0}>
            Crear tarea automatica ({taskItemTarget || 0} articulos)
          </button>
        </div>
        <p className="muted">
          Regla: maximo 2 tareas por semana por sitio. Solo admin crea tareas. Inventario disponible: {scopedInventory.length} articulos.
        </p>
        {!inventory.isLoading && scopedInventory.length === 0 ? (
          <p className="muted">
            No se detecta inventario para el sitio seleccionado. Verifica que los articulos esten guardados en {effectiveSite}.
          </p>
        ) : null}
      </article>

      <article className="card">
        <h3>Historial y previsualizacion de tareas</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Sitio</th><th>Semana</th><th>Fecha</th><th>Estatus</th><th>Diferencias</th><th>Accion</th>{isAdmin ? <th>Admin</th> : null}</tr></thead>
          <tbody>
            {scopedTasks.map((task) => {
              const diff = task.items.filter((item) => item.countedQty !== undefined && item.countedQty !== item.systemQty).length;
              return (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>{task.siteCode}</td>
                  <td>{task.weekKey}</td>
                  <td>{new Date(task.createdAt).toLocaleString()}</td>
                  <td>{task.status}</td>
                  <td>{diff}</td>
                  <td><button type="button" onClick={() => setSelectedTaskId(task.id)}>Abrir</button></td>
                  {isAdmin ? (
                    <td>
                      <button type="button" onClick={() => void removeTask(task)}>
                        {task.status === "pending" ? "Cancelar" : "Eliminar"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>

      {selectedTask ? (
        <article className="card">
          <h3>Tarea seleccionada: {selectedTask.id}</h3>
          <p>
            Estado: {selectedTask.status} | Diferencias detectadas: {discrepancyCount}
          </p>
          <table className="table">
            <thead><tr><th>SKU</th><th>Descripcion</th><th>Sistema</th><th>Conteo fisico</th><th>Diferencia</th></tr></thead>
            <tbody>
              {selectedTask.items.map((item) => {
                const counted =
                  countByItem[item.itemId] !== undefined
                    ? Number(countByItem[item.itemId])
                    : (item.countedQty ?? item.systemQty);
                const diff = counted - item.systemQty;
                return (
                  <tr key={item.itemId}>
                    <td>{item.sku}</td>
                    <td>{item.description}</td>
                    <td>{item.systemQty}</td>
                    <td>
                      <input
                        type="number"
                        value={countByItem[item.itemId] ?? String(item.countedQty ?? item.systemQty)}
                        onChange={(e) =>
                          setCountByItem((prev) => ({
                            ...prev,
                            [item.itemId]: e.target.value,
                          }))
                        }
                        disabled={selectedTask.status === "completed"}
                      />
                    </td>
                    <td>{diff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selectedTask.status !== "completed" ? (
            <button type="button" onClick={completeTask}>Finalizar tarea</button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
