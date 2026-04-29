import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteInventoryItem, listInventory, upsertInventory } from "../services/domain-service";
import { subscribeInventoryRealtime } from "../services/realtime-service";
import { useSessionStore } from "../state/use-session-store";
import type { SiteCode } from "../types/models";

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function InventoryPage() {
  const currentUser = useSessionStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === "admin";
  const defaultSite = currentUser?.siteCode ?? "CEDIS";

  const [site, setSite] = useState<SiteCode | "ALL">(isAdmin ? "ALL" : defaultSite);
  const [newSku, setNewSku] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newQuantity, setNewQuantity] = useState("0");
  const [newMinStock, setNewMinStock] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSku, setEditSku] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editQuantity, setEditQuantity] = useState("0");
  const [editMinStock, setEditMinStock] = useState("0");
  const [feedback, setFeedback] = useState<string | null>(null);
  const effectiveSite: SiteCode | "ALL" = isAdmin ? site : defaultSite;

  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["inventory", effectiveSite],
    queryFn: () => (effectiveSite === "ALL" ? listInventory() : listInventory(effectiveSite)),
  });

  useEffect(() => {
    const unsub = subscribeInventoryRealtime(() => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    });
    return () => unsub();
  }, [queryClient]);

  const mutation = useMutation({
    mutationFn: upsertInventory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const onCreateItem = () => {
    setFeedback(null);
    const sku = newSku.trim();
    const description = newDescription.trim();

    if (!sku || !description) {
      setFeedback("SKU y descripcion son obligatorios.");
      return;
    }

    const siteCode: SiteCode = effectiveSite === "ALL" ? defaultSite : effectiveSite;
    const quantity = isAdmin ? Number(newQuantity || 0) : 0;
    const minStock = isAdmin ? Number(newMinStock || 0) : 0;

    mutation.mutate(
      {
        siteCode,
        sku,
        description,
        size: newSize.trim() || undefined,
        quantity,
        recoveredStock: 0,
        minStock,
      },
      {
        onSuccess: () => {
          setFeedback("Item creado correctamente.");
          setNewSku("");
          setNewDescription("");
          setNewSize("");
          setNewQuantity("0");
          setNewMinStock("0");
        },
        onError: (error) => {
          setFeedback(error instanceof Error ? error.message : "No fue posible crear el item.");
        },
      },
    );
  };

  const onStartEdit = (
    id: string,
    sku: string,
    description: string,
    size: string | undefined,
    quantity: number,
    minStock: number,
  ) => {
    setEditingId(id);
    setEditSku(sku);
    setEditDescription(description);
    setEditSize(size ?? "");
    setEditQuantity(String(quantity));
    setEditMinStock(String(minStock));
    setFeedback(null);
  };

  const onSaveEdit = (itemSiteCode: SiteCode) => {
    if (!editingId) return;
    setFeedback(null);
    const sku = editSku.trim();
    const description = editDescription.trim();
    if (!sku || !description) {
      setFeedback("SKU y descripcion son obligatorios para guardar.");
      return;
    }

    mutation.mutate(
      {
        id: editingId,
        siteCode: itemSiteCode,
        sku,
        description,
        size: editSize.trim() || undefined,
        quantity: Number(editQuantity || 0),
        recoveredStock: rows?.find((item) => item.id === editingId)?.recoveredStock ?? 0,
        minStock: Number(editMinStock || 0),
      },
      {
        onSuccess: () => {
          setFeedback("Item actualizado correctamente.");
          setEditingId(null);
        },
        onError: (error) => {
          setFeedback(error instanceof Error ? error.message : "No fue posible actualizar el item.");
        },
      },
    );
  };

  const rows = query.data?.filter((item) => (isAdmin ? true : item.siteCode === defaultSite));

  const exportCsv = () => {
    if (!rows || rows.length === 0) {
      setFeedback("No hay datos para exportar.");
      return;
    }
    const header = [
      "Sitio",
      "SKU",
      "Descripcion",
      "Talla",
      "Stock principal",
      "Stock recuperado",
      "Stock minimo",
      "Estado stock",
      "Ultima actualizacion",
    ];
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const sortedRows = [...rows].sort((a, b) => {
      const siteCompare = a.siteCode.localeCompare(b.siteCode);
      if (siteCompare !== 0) return siteCompare;
      return a.sku.localeCompare(b.sku);
    });
    const body = sortedRows.map((item) => {
      const isLowStock = item.quantity <= item.minStock;
      return [
        escapeCsv(item.siteCode),
        escapeCsv(item.sku),
        escapeCsv(item.description),
        escapeCsv(item.size ?? "-"),
        escapeCsv(item.quantity),
        escapeCsv(item.recoveredStock),
        escapeCsv(item.minStock),
        escapeCsv(isLowStock ? "Bajo minimo" : "OK"),
        escapeCsv(new Date(item.updatedAt).toLocaleString()),
      ];
    });
    const csv = [header.join(","), ...body.map((line) => line.join(","))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const suffix = site === "ALL" ? "todos" : site.toLowerCase();
    link.download = `inventario-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback("CSV exportado correctamente.");
  };

  const onImportCsv = async (file: File) => {
    if (!isAdmin) {
      setFeedback("Solo admin puede importar CSV.");
      return;
    }
    setFeedback(null);
    try {
      const content = await file.text();
      const lines = content
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        setFeedback("El CSV no contiene datos.");
        return;
      }

      const headerLine = lines[0];
      const commaCount = (headerLine.match(/,/g) ?? []).length;
      const semicolonCount = (headerLine.match(/;/g) ?? []).length;
      const delimiter = semicolonCount > commaCount ? ";" : ",";

      const headers = parseCsvLine(lines[0], delimiter).map((h) => normalizeHeader(h));
      const idxSku = headers.indexOf("sku");
      const idxDesc = headers.indexOf("descripcion");
      const idxCantidad = headers.indexOf("cantidad");
      const idxStock = headers.indexOf("stock");
      const idxTalla = headers.indexOf("talla");
      const idxMin = headers.indexOf("cantidad minima");
      const idxMinStock = headers.indexOf("stock minimo");
      const idxSite = headers.indexOf("sitio");
      const idxQty = idxCantidad >= 0 ? idxCantidad : idxStock;
      const idxMinQty = idxMin >= 0 ? idxMin : idxMinStock;

      if (idxSku < 0 || idxDesc < 0 || idxTalla < 0 || idxQty < 0) {
        setFeedback("CSV invalido. Columnas requeridas: SKU, Descripcion, Talla, Stock.");
        return;
      }

      let processed = 0;
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i], delimiter);
        const sku = (cols[idxSku] ?? "").trim();
        const description = (cols[idxDesc] ?? "").trim();
        const rawQty = (cols[idxQty] ?? "").trim().replace(",", ".");
        const quantity = Number(rawQty);
        const size = (cols[idxTalla] ?? "").trim();
        const minStock = idxMinQty >= 0 ? Number(cols[idxMinQty] ?? 0) : 0;
        const siteCodeRaw = idxSite >= 0 ? (cols[idxSite] ?? "").trim().toUpperCase() : "";
        const siteCode: SiteCode =
          siteCodeRaw === "CEDIS" || siteCodeRaw === "ACUNA" || siteCodeRaw === "NLD"
            ? (siteCodeRaw as SiteCode)
            : (effectiveSite === "ALL" ? defaultSite : effectiveSite);

        if (!sku || !description || !size || Number.isNaN(quantity)) continue;

        const existing = (rows ?? []).find((item) => item.sku.toLowerCase() === sku.toLowerCase() && item.siteCode === siteCode);

        await mutation.mutateAsync({
          id: existing?.id,
          siteCode,
          sku,
          description,
          size,
          quantity,
          recoveredStock: existing?.recoveredStock ?? 0,
          minStock: Number.isNaN(minStock) ? (existing?.minStock ?? 0) : minStock,
        });
        processed += 1;
      }

      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setFeedback(`Importacion completada. Registros procesados: ${processed}.`);
    } catch {
      setFeedback("No se pudo leer/importar el CSV.");
    }
  };

  const onDeleteItem = (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("¿Eliminar este articulo del inventario?")) return;
    deleteMutation.mutate(id, {
      onError: (error) => {
        setFeedback(error instanceof Error ? error.message : "No fue posible eliminar el articulo.");
      },
    });
  };

  return (
    <section>
      <h1>Inventario por sitio</h1>
      {feedback ? <p className="status-message">{feedback}</p> : null}

      <article className="card">
        <h3>Crear nuevo item</h3>
        <p className="muted">
          {isAdmin
            ? "Admin: puedes capturar SKU, descripcion, talla, stock y stock minimo."
            : "Usuario: puedes capturar SKU, descripcion y talla. Stock solo admin."}
        </p>

        <div className="inventory-form-grid">
          <label className="form-field">
            <span>Sitio</span>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as SiteCode | "ALL")}
              disabled={!isAdmin}
            >
              {isAdmin ? <option value="ALL">Todos</option> : null}
              <option value="CEDIS">CEDIS</option>
              <option value="ACUNA">ACUNA</option>
              <option value="NLD">NLD</option>
            </select>
          </label>

          <label className="form-field">
            <span>SKU</span>
            <input placeholder="Ej. BOT-001" value={newSku} onChange={(e) => setNewSku(e.target.value)} />
          </label>

          <label className="form-field">
            <span>Descripcion</span>
            <input
              placeholder="Nombre del item"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Talla (opcional)</span>
            <input placeholder="Ej. CH, M, 28" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
          </label>

          <label className="form-field">
              <span>Stock principal</span>
            <input
              type="number"
              placeholder="0"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              disabled={!isAdmin}
            />
          </label>

          <label className="form-field">
            <span>Stock recuperado</span>
            <input
              type="number"
              value={0}
              disabled
            />
            <span className="muted">Se actualiza solo desde Operaciones &gt; Recuperaciones.</span>
          </label>

          <label className="form-field">
              <span>Stock minimo</span>
            <input
              type="number"
              placeholder="0"
              value={newMinStock}
              onChange={(e) => setNewMinStock(e.target.value)}
              disabled={!isAdmin}
            />
          </label>
        </div>

        <div className="row">
          <button onClick={onCreateItem}>Crear item</button>
        {isAdmin ? (
          <button type="button" onClick={exportCsv}>
            Exportar CSV
          </button>
        ) : null}
        {isAdmin ? (
          <label className="suggestion-item" style={{ display: "inline-flex", alignItems: "center", gap: ".5rem", cursor: "pointer" }}>
            Importar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportCsv(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
        </div>
      </article>

      <table className="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Descripcion</th>
            <th>Talla</th>
            <th>Sitio</th>
            <th>Stock principal</th>
            <th>Stock recuperado</th>
            <th>Min</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((item) => (
            <tr key={item.id}>
              <td>
                {editingId === item.id ? (
                  <input value={editSku} onChange={(e) => setEditSku(e.target.value)} />
                ) : (
                  item.sku
                )}
              </td>
              <td>
                {editingId === item.id ? (
                  <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                ) : (
                  item.description
                )}
              </td>
              <td>
                {editingId === item.id ? (
                  <input value={editSize} onChange={(e) => setEditSize(e.target.value)} />
                ) : (
                  item.size ?? "-"
                )}
              </td>
              <td>{item.siteCode}</td>
              <td>
                {editingId === item.id ? (
                  <input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    disabled={!isAdmin}
                  />
                ) : (
                  item.quantity
                )}
              </td>
              <td>
                {item.recoveredStock}
              </td>
              <td>
                {editingId === item.id ? (
                  <input
                    type="number"
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(e.target.value)}
                    disabled={!isAdmin}
                  />
                ) : (
                  item.minStock
                )}
              </td>
              <td>
                {editingId === item.id ? (
                  <div className="row">
                    <button onClick={() => onSaveEdit(item.siteCode)}>Guardar</button>
                    <button onClick={() => setEditingId(null)}>Cancelar</button>
                  </div>
                ) : (
                  <div className="row">
                    <button
                      onClick={() =>
                        onStartEdit(
                          item.id,
                          item.sku,
                          item.description,
                          item.size,
                          item.quantity,
                          item.minStock,
                        )
                      }
                    >
                      Editar
                    </button>
                    {isAdmin ? (
                      <button type="button" onClick={() => onDeleteItem(item.id)}>
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
