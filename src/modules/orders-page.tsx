import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInventory } from "../services/domain-service";
import { listCollaboratorHistory } from "../services/collaborator-profile-service";
import {
  createPurchaseOrderDraft,
  listPurchaseOrders,
  type PurchaseOrderItem,
} from "../services/purchase-order-service";
import { generatePurchaseOrderPdf } from "../services/pdf-service";
import { useSessionStore } from "../state/use-session-store";
import type { InventoryItem, SiteCode } from "../types/models";

function getAutoSuggestionItems(
  inventory: InventoryItem[],
  siteCode: SiteCode,
  history: Array<{ siteCode: SiteCode; itemLabel: string; quantity: number }>,
) {
  const scopedHistory = history.filter((event) => event.siteCode === siteCode);
  const usageByItem = new Map<string, number>();
  scopedHistory.forEach((event) => {
    const prev = usageByItem.get(event.itemLabel) ?? 0;
    usageByItem.set(event.itemLabel, prev + event.quantity);
  });

  return inventory
    .map((item) => {
      const key = `${item.sku} - ${item.description}`;
      const usage = usageByItem.get(key) ?? 0;
      const lowStockFactor = Math.max(item.minStock - item.quantity, 0);
      const score = usage * 2 + lowStockFactor;
      const suggestedQty = Math.max(lowStockFactor, usage > 0 ? Math.ceil(usage / 2) : 0);
      return { item, score, suggestedQty, usage, lowStockFactor };
    })
    .filter((entry) => entry.score > 0 && entry.suggestedQty > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => ({
      inventoryItemId: entry.item.id,
      sku: entry.item.sku,
      description: entry.item.description,
      quantity: entry.suggestedQty,
      reason:
        entry.lowStockFactor > 0 && entry.usage > 0
          ? "Bajo stock y alto consumo"
          : entry.lowStockFactor > 0
            ? "Bajo stock"
            : "Consumo frecuente",
    }));
}

export function OrdersPage() {
  const user = useSessionStore((s) => s.currentUser);
  const isAdmin = user?.role === "admin";
  const defaultSite = user?.siteCode ?? "CEDIS";
  const [site, setSite] = useState<SiteCode>(defaultSite);
  const [requestTitle, setRequestTitle] = useState("Pedido de reposicion para autorizacion");
  const [manualSearch, setManualSearch] = useState("");
  const [manualQtyByItem, setManualQtyByItem] = useState<Record<string, string>>({});
  const [manualSelectedIds, setManualSelectedIds] = useState<string[]>([]);
  const [manualReason, setManualReason] = useState("Reposicion manual");
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const inventory = useQuery({ queryKey: ["inventory"], queryFn: listInventory });
  const history = useQuery({ queryKey: ["collaborator-history"], queryFn: listCollaboratorHistory });
  const drafts = useQuery({ queryKey: ["purchase-orders"], queryFn: listPurchaseOrders });

  const scopedInventory = (inventory.data ?? []).filter((item) => (isAdmin ? item.siteCode === site : item.siteCode === defaultSite));
  const manualCandidates = scopedInventory.filter((item) => {
    const term = manualSearch.trim().toLowerCase();
    if (!term) return false;
    return item.sku.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
  });

  const addItem = (payload: PurchaseOrderItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.inventoryItemId === payload.inventoryItemId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + payload.quantity };
        return next;
      }
      return [...prev, payload];
    });
  };

  const addAutomatic = () => {
    const autoItems = getAutoSuggestionItems(
      scopedInventory,
      isAdmin ? site : defaultSite,
      history.data ?? [],
    );
    if (autoItems.length === 0) {
      setFeedback("No hay suficientes datos de uso o bajo stock para generar sugerencias automaticas.");
      return;
    }
    autoItems.forEach((item) => addItem(item));
    setFeedback(`Se agregaron ${autoItems.length} articulos sugeridos automaticamente.`);
  };

  const toggleManualSelection = (itemId: string) => {
    setManualSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const addManualSelected = () => {
    if (manualSelectedIds.length === 0) {
      setFeedback("Selecciona al menos un articulo manual.");
      return;
    }

    let added = 0;
    for (const id of manualSelectedIds) {
      const item = scopedInventory.find((it) => it.id === id);
      if (!item) continue;
      const qty = Number(manualQtyByItem[id] ?? "1");
      if (qty <= 0) continue;
      addItem({
        inventoryItemId: item.id,
        sku: item.sku,
        description: item.description,
        quantity: qty,
        reason: manualReason.trim() || "Reposicion manual",
      });
      added += 1;
    }

    if (added === 0) {
      setFeedback("Las cantidades seleccionadas deben ser mayores a 0.");
      return;
    }
    setFeedback(`Se agregaron ${added} articulos manuales al pedido.`);
    setManualSelectedIds([]);
    setManualQtyByItem({});
  };

  const saveAndGenerate = async () => {
    if (items.length === 0) {
      setFeedback("Agrega al menos un articulo al pedido.");
      return;
    }
    const draft = await createPurchaseOrderDraft({
      siteCode: isAdmin ? site : defaultSite,
      requestedBy: user?.fullName ?? "Usuario",
      title: requestTitle.trim() || "Pedido para autorizacion",
      items,
    });
    generatePurchaseOrderPdf(draft);
    setItems([]);
    setManualSearch("");
    setManualQtyByItem({});
    setManualSelectedIds([]);
    setManualReason("Reposicion manual");
    setFeedback(`Pedido ${draft.orderNumber} guardado y PDF generado.`);
    await drafts.refetch();
  };

  return (
    <section>
      <h1>Pedidos</h1>
      {feedback ? <p className="status-message">{feedback}</p> : null}
      <article className="card">
        <h3>Generar pedido</h3>
        <div className="inventory-form-grid">
          <label className="form-field">
            <span>Sitio</span>
            <select value={site} onChange={(e) => setSite(e.target.value as SiteCode)} disabled={!isAdmin}>
              <option value="CEDIS">CEDIS</option>
              <option value="ACUNA">ACUNA</option>
              <option value="NLD">NLD</option>
            </select>
          </label>
          <label className="form-field">
            <span>Titulo del pedido</span>
            <input value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={addAutomatic}>Generar automatico (uso + bajo stock)</button>
        </div>

        <h4>Agregar manual</h4>
        <div className="inventory-form-grid">
          <label className="form-field">
            <span>Buscar SKU o descripcion (multiseleccion)</span>
            <input value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
            {manualCandidates.length > 0 ? (
              <div className="suggestions-list">
                {manualCandidates.slice(0, 8).map((item) => (
                  <div key={item.id} className="suggestion-item" style={{ display: "grid", gridTemplateColumns: "20px 1fr 80px" }}>
                    <input
                      type="checkbox"
                      checked={manualSelectedIds.includes(item.id)}
                      onChange={() => toggleManualSelection(item.id)}
                    />
                    <span>
                      {item.sku} - {item.description} (Stock: {item.quantity}, Min: {item.minStock})
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={manualQtyByItem[item.id] ?? "1"}
                      onChange={(e) =>
                        setManualQtyByItem((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </label>
          <label className="form-field">
            <span>Motivo</span>
            <input value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={addManualSelected}>Agregar seleccionados</button>
        </div>
      </article>

      <article className="card">
        <h3>Articulos del pedido actual</h3>
        <table className="table">
          <thead><tr><th>SKU</th><th>Descripcion</th><th>Cantidad</th><th>Motivo</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.inventoryItemId}>
                <td>{item.sku}</td>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button type="button" onClick={saveAndGenerate}>Guardar y generar PDF</button>
        </div>
      </article>

      <article className="card">
        <h3>Pedidos guardados</h3>
        <table className="table">
          <thead><tr><th>Numero</th><th>Sitio</th><th>Solicitante</th><th>Fecha</th><th>Items</th><th>Accion</th></tr></thead>
          <tbody>
            {(drafts.data ?? [])
              .filter((order) => (isAdmin ? order.siteCode === site : order.siteCode === defaultSite))
              .map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNumber}</td>
                  <td>{order.siteCode}</td>
                  <td>{order.requestedBy}</td>
                  <td>{new Date(order.createdAt).toLocaleString()}</td>
                  <td>{order.items.length}</td>
                  <td><button onClick={() => generatePurchaseOrderPdf(order)}>Descargar PDF</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
