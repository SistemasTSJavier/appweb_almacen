import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChange,
  createDispatch,
  createEntry,
  createRecovery,
  deleteDispatch,
  deleteEntry,
  listChanges,
  listDispatches,
  listEmployees,
  listEntries,
  listInventory,
  listRecoveries,
  upsertInventory,
} from "../services/domain-service";
import {
  addCollaboratorHistory,
  listCollaboratorHistory,
  listCollaboratorProfiles,
  upsertCollaboratorProfile,
} from "../services/collaborator-profile-service";
import { uploadEvidence } from "../services/evidence-service";
import { useSessionStore } from "../state/use-session-store";
import { ToastMessage } from "../shared/toast-message";
import type { InventoryItem, SiteCode } from "../types/models";

type OperationsTab = "entradas" | "salidas" | "recuperaciones" | "cambio";
type StockSource = "quantity" | "recovered";
type RecoveryMode = "desecho" | "ingreso_inventario";
type EntryDraft = {
  itemId: string;
  sku: string;
  description: string;
  size?: string | null;
  quantity: number;
};
type DispatchDraft = EntryDraft;
type RecoveryDraft = EntryDraft;
type ChangeDraft = {
  damagedItemId: string;
  damagedSku: string;
  damagedDescription: string;
  replacementItemId: string;
  replacementSku: string;
  replacementDescription: string;
  replacementSize?: string | null;
  quantity: number;
};

const allSites: SiteCode[] = ["CEDIS", "ACUNA", "NLD"];

export function OperationsPage() {
  const queryClient = useQueryClient();
  const currentUser = useSessionStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === "admin";
  const canAdjustStock =
    currentUser?.role === "admin" ||
    currentUser?.role === "operaciones" ||
    currentUser?.role === "almacen_cedis" ||
    currentUser?.role === "almacen_acuna" ||
    currentUser?.role === "almacen_nld";
  const defaultSite: SiteCode = currentUser?.siteCode ?? "CEDIS";

  const [activeTab, setActiveTab] = useState<OperationsTab>("entradas");
  const [site, setSite] = useState<SiteCode>(defaultSite);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");

  const [entrySku, setEntrySku] = useState("");
  const [entryQty, setEntryQty] = useState("1");
  const [entryNotes, setEntryNotes] = useState("");
  const [entrySelectedItemId, setEntrySelectedItemId] = useState("");
  const [entryDraftItems, setEntryDraftItems] = useState<EntryDraft[]>([]);

  const [dispatchEmployeeSearch, setDispatchEmployeeSearch] = useState("");
  const [dispatchEmployeeId, setDispatchEmployeeId] = useState("");
  const [dispatchItemSearch, setDispatchItemSearch] = useState("");
  const [dispatchItemId, setDispatchItemId] = useState("");
  const [dispatchQty, setDispatchQty] = useState("1");
  const [dispatchKind, setDispatchKind] = useState<"renovacion" | "segundo_uniforme" | "sin_motivo">("renovacion");
  const [dispatchStockSource, setDispatchStockSource] = useState<StockSource>("quantity");
  const [dispatchEvidenceFile, setDispatchEvidenceFile] = useState<File | null>(null);
  const [isDispatchEvidenceDragging, setIsDispatchEvidenceDragging] = useState(false);
  const [dispatchDraftItems, setDispatchDraftItems] = useState<DispatchDraft[]>([]);

  const [recoveryEmployeeSearch, setRecoveryEmployeeSearch] = useState("");
  const [recoveryEmployeeId, setRecoveryEmployeeId] = useState("");
  const [recoveryItemSearch, setRecoveryItemSearch] = useState("");
  const [recoveryItemId, setRecoveryItemId] = useState("");
  const [recoveryQty, setRecoveryQty] = useState("1");
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>("ingreso_inventario");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryDraftItems, setRecoveryDraftItems] = useState<RecoveryDraft[]>([]);

  const [changeEmployeeSearch, setChangeEmployeeSearch] = useState("");
  const [changeEmployeeId, setChangeEmployeeId] = useState("");
  const [changeDamagedSearch, setChangeDamagedSearch] = useState("");
  const [changeDamagedItemId, setChangeDamagedItemId] = useState("");
  const [changeReplacementSearch, setChangeReplacementSearch] = useState("");
  const [changeReplacementItemId, setChangeReplacementItemId] = useState("");
  const [changeQty, setChangeQty] = useState("1");
  const [changeStockSource, setChangeStockSource] = useState<StockSource>("quantity");
  const [changeReason, setChangeReason] = useState("");
  const [changeEvidenceFile, setChangeEvidenceFile] = useState<File | null>(null);
  const [isChangeEvidenceDragging, setIsChangeEvidenceDragging] = useState(false);
  const [changeDraftItems, setChangeDraftItems] = useState<ChangeDraft[]>([]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    return fallback;
  };

  const employees = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const inventory = useQuery({
    queryKey: ["inventory", site, isAdmin],
    queryFn: () => listInventory(site),
  });
  const entries = useQuery({ queryKey: ["entries"], queryFn: listEntries });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: listDispatches });
  const recoveries = useQuery({ queryKey: ["recoveries"], queryFn: listRecoveries });
  const changes = useQuery({ queryKey: ["changes"], queryFn: listChanges });
  const collaboratorProfilesQuery = useQuery({
    queryKey: ["collaborator-profiles"],
    queryFn: listCollaboratorProfiles,
  });
  const collaboratorHistoryQuery = useQuery({
    queryKey: ["collaborator-history"],
    queryFn: listCollaboratorHistory,
  });

  const updateInventoryMutation = useMutation({
    mutationFn: upsertInventory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  const entryMutation = useMutation({ mutationFn: createEntry });
  const dispatchMutation = useMutation({ mutationFn: createDispatch });
  const recoveryMutation = useMutation({ mutationFn: createRecovery });
  const changeMutation = useMutation({ mutationFn: createChange });
  const deleteEntryMutation = useMutation({ mutationFn: deleteEntry });
  const deleteDispatchMutation = useMutation({ mutationFn: deleteDispatch });

  const allEmployees = employees.data ?? [];
  const collaboratorProfiles = collaboratorProfilesQuery.data ?? [];
  const collaboratorHistory = collaboratorHistoryQuery.data ?? [];
  const employeeSource = useMemo(
    () =>
      allEmployees.map((emp) => {
        const profile =
          collaboratorProfiles.find((p) => p.employeeId === emp.id) ??
          collaboratorProfiles.find((p) => p.employeeCode === emp.employeeCode);
        return {
          id: emp.id,
          employeeCode: emp.employeeCode,
          fullName: emp.fullName,
          siteCode: emp.siteCode,
          service: profile?.service,
        };
      }),
    [allEmployees, collaboratorProfiles],
  );
  const scopedInventory = (inventory.data ?? []).filter((item) => (isAdmin ? item.siteCode === site : true));
  const allInventory = inventory.data ?? [];

  const normalizeSku = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizeText = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const findBySearch = (term: string, list: InventoryItem[]) => {
    const normalized = normalizeText(term);
    const normalizedSkuTerm = normalizeSku(term);
    if (!normalized) return [];
    const searchTokens = normalized.split(" ").filter(Boolean);
    return list.filter(
      (item) => {
        const skuText = normalizeText(item.sku);
        const descriptionText = normalizeText(item.description);
        const sizeText = normalizeText(item.size ?? "");
        const searchable = `${skuText} ${descriptionText} ${sizeText}`.trim();
        return (
          skuText.includes(normalized) ||
          normalizeSku(item.sku).includes(normalizedSkuTerm) ||
          searchTokens.every((token) => searchable.includes(token))
        );
      },
    );
  };

  const scoreSearch = (term: string, item: InventoryItem) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return 1;
    const tokens = normalizedTerm.split(" ").filter(Boolean);
    const skuText = normalizeText(item.sku);
    const descriptionText = normalizeText(item.description);
    const sizeText = normalizeText(item.size ?? "");
    const searchable = `${skuText} ${descriptionText} ${sizeText}`.trim();

    let score = 0;
    if (skuText.startsWith(normalizedTerm)) score += 50;
    if (descriptionText.startsWith(normalizedTerm)) score += 35;
    if (searchable.includes(normalizedTerm)) score += 20;
    for (const token of tokens) {
      if (skuText.includes(token)) score += 12;
      if (descriptionText.includes(token)) score += 10;
      if (sizeText.includes(token)) score += 8;
    }
    return score;
  };

  const scoreEmployeeSearch = (term: string, employeeCode: string, fullName: string) => {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) return 1;
    const tokens = normalizedTerm.split(" ").filter(Boolean);
    const codeText = normalizeText(employeeCode);
    const nameText = normalizeText(fullName);
    const searchable = `${codeText} ${nameText}`.trim();

    let score = 0;
    if (codeText.startsWith(normalizedTerm)) score += 40;
    if (nameText.startsWith(normalizedTerm)) score += 30;
    if (searchable.includes(normalizedTerm)) score += 15;
    for (const token of tokens) {
      if (codeText.includes(token)) score += 10;
      if (nameText.includes(token)) score += 8;
    }
    return score;
  };

  const dispatchCandidates = findBySearch(dispatchItemSearch, scopedInventory);
  const entryCandidates = findBySearch(entrySku, scopedInventory);
  const isEntrySearching = entrySku.trim().length > 0;
  const entrySourceInventory = scopedInventory.length > 0 ? scopedInventory : allInventory;
  const entryPreviewItems = [...entrySourceInventory]
    .map((item) => ({ item, score: scoreSearch(entrySku, item) }))
    .sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku))
    .slice(0, isEntrySearching ? 8 : 12)
    .map((row) => row.item);
  const recoveryCandidates = findBySearch(recoveryItemSearch, scopedInventory);
  const changeDamagedCandidates = findBySearch(changeDamagedSearch, scopedInventory);
  const changeReplacementCandidates = findBySearch(changeReplacementSearch, scopedInventory);

  const dispatchItemPreview = [...scopedInventory]
    .map((item) => ({ item, score: scoreSearch(dispatchItemSearch, item) }))
    .sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku))
    .slice(0, dispatchItemSearch.trim() ? 8 : 12)
    .map((row) => row.item);
  const recoveryItemPreview = [...scopedInventory]
    .map((item) => ({ item, score: scoreSearch(recoveryItemSearch, item) }))
    .sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku))
    .slice(0, recoveryItemSearch.trim() ? 8 : 12)
    .map((row) => row.item);
  const changeDamagedPreview = [...scopedInventory]
    .map((item) => ({ item, score: scoreSearch(changeDamagedSearch, item) }))
    .sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku))
    .slice(0, changeDamagedSearch.trim() ? 8 : 12)
    .map((row) => row.item);
  const changeReplacementPreview = [...scopedInventory]
    .map((item) => ({ item, score: scoreSearch(changeReplacementSearch, item) }))
    .sort((a, b) => b.score - a.score || a.item.sku.localeCompare(b.item.sku))
    .slice(0, changeReplacementSearch.trim() ? 8 : 12)
    .map((row) => row.item);

  const dispatchEmployeeCandidates = employeeSource.filter((emp) => {
    const term = dispatchEmployeeSearch.trim().toLowerCase();
    if (!term) return true;
    return emp.fullName.toLowerCase().includes(term) || emp.employeeCode.toLowerCase().includes(term);
  });
  const recoveryEmployeeCandidates = employeeSource.filter((emp) => {
    const term = recoveryEmployeeSearch.trim().toLowerCase();
    if (!term) return true;
    return emp.fullName.toLowerCase().includes(term) || emp.employeeCode.toLowerCase().includes(term);
  });
  const changeEmployeeCandidates = employeeSource.filter((emp) => {
    const term = changeEmployeeSearch.trim().toLowerCase();
    if (!term) return true;
    return emp.fullName.toLowerCase().includes(term) || emp.employeeCode.toLowerCase().includes(term);
  });

  const dispatchEmployeePreview = [...employeeSource]
    .map((emp) => ({ emp, score: scoreEmployeeSearch(dispatchEmployeeSearch, emp.employeeCode, emp.fullName) }))
    .sort((a, b) => b.score - a.score || a.emp.employeeCode.localeCompare(b.emp.employeeCode))
    .slice(0, dispatchEmployeeSearch.trim() ? 8 : 12)
    .map((row) => row.emp);
  const recoveryEmployeePreview = [...employeeSource]
    .map((emp) => ({ emp, score: scoreEmployeeSearch(recoveryEmployeeSearch, emp.employeeCode, emp.fullName) }))
    .sort((a, b) => b.score - a.score || a.emp.employeeCode.localeCompare(b.emp.employeeCode))
    .slice(0, recoveryEmployeeSearch.trim() ? 8 : 12)
    .map((row) => row.emp);
  const changeEmployeePreview = [...employeeSource]
    .map((emp) => ({ emp, score: scoreEmployeeSearch(changeEmployeeSearch, emp.employeeCode, emp.fullName) }))
    .sort((a, b) => b.score - a.score || a.emp.employeeCode.localeCompare(b.emp.employeeCode))
    .slice(0, changeEmployeeSearch.trim() ? 8 : 12)
    .map((row) => row.emp);

  const dispatchEmployeeSelected = employeeSource.find((emp) => emp.id === dispatchEmployeeId);
  const dispatchItemSelected = scopedInventory.find((item) => item.id === dispatchItemId);
  const recoveryEmployeeSelected = employeeSource.find((emp) => emp.id === recoveryEmployeeId);
  const recoveryItemSelected = scopedInventory.find((item) => item.id === recoveryItemId);
  const changeEmployeeSelected = employeeSource.find((emp) => emp.id === changeEmployeeId);
  const changeDamagedSelected = scopedInventory.find((item) => item.id === changeDamagedItemId);
  const changeReplacementSelected = scopedInventory.find((item) => item.id === changeReplacementItemId);
  const entrySelected = scopedInventory.find((item) => item.id === entrySelectedItemId);

  const resolveDispatchType = (note?: string) => {
    if (!note) return "Sin tipo";
    const typeRaw = note.split("/")[0]?.trim().toLowerCase() ?? "";
    if (typeRaw === "renovacion") return "Renovacion de uniforme";
    if (typeRaw === "segundo_uniforme") return "2do uniforme";
    if (typeRaw === "sin_motivo") return "Sin motivo";
    return typeRaw || "Sin tipo";
  };

  const getDispatchDetails = (dispatchCreatedAt: string, employeeId: string, siteCode: SiteCode) => {
    const dispatchTime = new Date(dispatchCreatedAt).getTime();
    const related = collaboratorHistory.filter((event) => {
      if (event.type !== "salida") return false;
      if (event.employeeId !== employeeId) return false;
      if (event.siteCode !== siteCode) return false;
      const eventTime = new Date(event.createdAt).getTime();
      return Math.abs(eventTime - dispatchTime) <= 3 * 60 * 1000;
    });
    if (related.length === 0) {
      return {
        dispatchType: "Sin tipo",
        itemsLabel: "Articulos no disponibles",
      };
    }
    const dispatchType = resolveDispatchType(related[0]?.note);
    const itemsLabel = related.map((event) => `${event.itemLabel} x${event.quantity}`).join(" | ");
    return { dispatchType, itemsLabel };
  };

  useEffect(() => {
    setEntryDraftItems([]);
    setEntrySelectedItemId("");
    setEntrySku("");
  }, [site]);

  const counters = useMemo(
    () => ({
      entradas: (entries.data ?? []).filter((r) => (isAdmin ? r.siteCode === site : true)).length,
      salidas: (dispatches.data ?? []).filter((r) => (isAdmin ? r.siteCode === site : true)).length,
      recuperaciones: (recoveries.data ?? []).filter((r) => (isAdmin ? r.siteCode === site : true)).length,
      cambios: (changes.data ?? []).filter((r) => (isAdmin ? r.siteCode === site : true)).length,
    }),
    [entries.data, dispatches.data, recoveries.data, changes.data, isAdmin, site],
  );

  const historyRows = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const fromTime = historyFrom ? new Date(`${historyFrom}T00:00:00`).getTime() : null;
    const toTime = historyTo ? new Date(`${historyTo}T23:59:59`).getTime() : null;
    const bySite = <T extends { siteCode: SiteCode }>(rows: T[]) =>
      rows.filter((row) => (isAdmin ? row.siteCode === site : true));

    const inRange = (createdAt: string) => {
      const time = new Date(createdAt).getTime();
      if (fromTime && time < fromTime) return false;
      if (toTime && time > toTime) return false;
      return true;
    };

    const searchMatch = (content: string) => (!term ? true : content.toLowerCase().includes(term));

    const baseRows =
      activeTab === "entradas"
        ? bySite(entries.data ?? [])
        .filter((row) => inRange(row.createdAt))
        .filter((row) => searchMatch(row.notes ?? ""))
        .map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          type: "entrada",
          main: row.notes || "Entrada registrada",
          secondary: `Sitio ${row.siteCode}`,
        }))
        : activeTab === "salidas"
          ? bySite(dispatches.data ?? [])
        .filter((row) => inRange(row.createdAt))
        .filter((row) => searchMatch(`${row.employeeId} ${row.proofUrl ?? ""}`))
        .map((row) => {
          const employee = employeeSource.find((emp) => emp.id === row.employeeId);
          const employeeLabel = employee
            ? `${employee.employeeCode} - ${employee.fullName}`
            : `Colaborador ${row.employeeId}`;
          const details = getDispatchDetails(row.createdAt, row.employeeId, row.siteCode);
          return {
            id: row.id,
            createdAt: row.createdAt,
            type: "salida",
            main: employeeLabel,
            secondary: `Tipo: ${details.dispatchType} | Articulos: ${details.itemsLabel}${row.proofUrl ? ` | Evidencia: ${row.proofUrl}` : ""}`,
          };
        })
          : activeTab === "recuperaciones"
            ? bySite(recoveries.data ?? [])
        .filter((row) => inRange(row.createdAt))
        .filter((row) => searchMatch(`${row.employeeId} ${row.reason}`))
        .map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          type: "recuperacion",
          main: `Colaborador ${row.employeeId}`,
          secondary: row.reason,
        }))
            : bySite(changes.data ?? [])
      .filter((row) => inRange(row.createdAt))
      .filter((row) => searchMatch(`${row.employeeId} ${row.reason}`))
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        type: "cambio",
        main: `Colaborador ${row.employeeId}`,
        secondary: row.reason,
      }));

    return [...baseRows].sort((a, b) =>
      historySort === "newest"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [activeTab, changes.data, collaboratorHistory, dispatches.data, employeeSource, entries.data, historyFrom, historySearch, historySort, historyTo, isAdmin, recoveries.data, site]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(historyRows.length / pageSize));
  const safePage = Math.min(historyPage, totalPages);
  const paginatedHistory = historyRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportHistoryCsv = () => {
    if (historyRows.length === 0) {
      setFeedback("No hay historial para exportar.");
      return;
    }
    const header = ["Tipo", "Fecha", "Detalle", "Info"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const body = historyRows.map((row) => [
      esc(row.type),
      esc(new Date(row.createdAt).toLocaleString()),
      esc(row.main),
      esc(row.secondary),
    ]);
    const csv = [header.join(","), ...body.map((line) => line.join(","))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `historial-${activeTab}-${site}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback("Historial exportado a CSV.");
  };

  const updateStock = async (item: InventoryItem, amount: number, source: StockSource, mode: "add" | "subtract") => {
    if (!canAdjustStock) {
      throw new Error("No tienes permisos para ajustar stock.");
    }
    const direction = mode === "add" ? amount : -amount;
    const newQuantity = source === "quantity" ? item.quantity + direction : item.quantity;
    const newRecovered = source === "recovered" ? item.recoveredStock + direction : item.recoveredStock;
    if (newQuantity < 0 || newRecovered < 0) throw new Error("Stock insuficiente para la operacion.");

    await updateInventoryMutation.mutateAsync({
      id: item.id,
      siteCode: item.siteCode,
      sku: item.sku,
      description: item.description,
      size: item.size,
      quantity: newQuantity,
      recoveredStock: newRecovered,
      minStock: item.minStock,
    });
  };

  const handleAddEntryDraft = () => {
    const qty = Number(entryQty || 0);
    const term = entrySku.trim().toLowerCase();
    const skuTerm = normalizeSku(entrySku);
    const selectedById = scopedInventory.find((it) => it.id === entrySelectedItemId);
    const selectedBySku = scopedInventory.find((it) => it.sku.toLowerCase() === term);
    const selectedByNormalizedSku = scopedInventory.find((it) => normalizeSku(it.sku) === skuTerm);
    const selectedFromCandidates = entryCandidates[0];
    const item = selectedById ?? selectedBySku ?? selectedByNormalizedSku ?? selectedFromCandidates;
    if (!item || qty <= 0) {
      setFeedback("No se encontro un item para ese texto. Seleccionalo de la lista y valida la cantidad.");
      return;
    }

    setEntryDraftItems((current) => {
      const existing = current.find((draft) => draft.itemId === item.id);
      if (existing) {
        return current.map((draft) =>
          draft.itemId === item.id ? { ...draft, quantity: draft.quantity + qty } : draft,
        );
      }
      return [
        ...current,
        {
          itemId: item.id,
          sku: item.sku,
          description: item.description,
          size: item.size,
          quantity: qty,
        },
      ];
    });
    setEntryQty("1");
    setEntrySku("");
    setEntrySelectedItemId("");
    setFeedback(`Articulo ${item.sku} agregado a la lista.`);
  };

  const handleRemoveEntryDraft = (itemId: string) => {
    setEntryDraftItems((current) => current.filter((item) => item.itemId !== itemId));
  };

  const handleCreateEntry = async () => {
    try {
      setFeedback(null);
      if (entryDraftItems.length === 0) throw new Error("Agrega al menos un articulo a la entrada.");

      const entryItems = entryDraftItems.map((draft) => {
        const item = scopedInventory.find((it) => it.id === draft.itemId);
        if (!item) throw new Error(`No se encontro el item ${draft.sku} en el sitio.`);
        return { draft, item };
      });

      await entryMutation.mutateAsync({
        siteCode: site,
        employeeId: undefined,
        notes: `Entrada masiva (${entryItems.length} articulos). ${entryNotes}`.trim(),
      });

      for (const { draft, item } of entryItems) {
        await updateStock(item, draft.quantity, "quantity", "add");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["entries"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      setFeedback(`Entrada registrada correctamente con ${entryItems.length} articulo(s).`);
      setEntryQty("1");
      setEntryNotes("");
      setEntrySku("");
      setEntrySelectedItemId("");
      setEntryDraftItems([]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo registrar la entrada.");
    }
  };

  const handleAddDispatchDraft = () => {
    const qty = Number(dispatchQty || 0);
    if (!dispatchItemId || qty <= 0) {
      setFeedback("Selecciona item y stock valido para agregar.");
      return;
    }
    const item = scopedInventory.find((it) => it.id === dispatchItemId);
    if (!item) return;
    setDispatchDraftItems((current) => {
      const existing = current.find((it) => it.itemId === item.id);
      if (existing) {
        return current.map((it) => (it.itemId === item.id ? { ...it, quantity: it.quantity + qty } : it));
      }
      return [...current, { itemId: item.id, sku: item.sku, description: item.description, size: item.size, quantity: qty }];
    });
    setDispatchQty("1");
    setDispatchItemId("");
    setDispatchItemSearch("");
  };

  const handleAddRecoveryDraft = () => {
    const qty = Number(recoveryQty || 0);
    if (!recoveryItemId || qty <= 0) {
      setFeedback("Selecciona item y stock valido para agregar.");
      return;
    }
    const item = scopedInventory.find((it) => it.id === recoveryItemId);
    if (!item) return;
    setRecoveryDraftItems((current) => {
      const existing = current.find((it) => it.itemId === item.id);
      if (existing) {
        return current.map((it) => (it.itemId === item.id ? { ...it, quantity: it.quantity + qty } : it));
      }
      return [...current, { itemId: item.id, sku: item.sku, description: item.description, size: item.size, quantity: qty }];
    });
    setRecoveryQty("1");
    setRecoveryItemId("");
    setRecoveryItemSearch("");
  };

  const handleAddChangeDraft = () => {
    const qty = Number(changeQty || 0);
    if (!changeDamagedItemId || !changeReplacementItemId || qty <= 0) {
      setFeedback("Selecciona item danado, reemplazo y cantidad valida.");
      return;
    }
    const damaged = scopedInventory.find((it) => it.id === changeDamagedItemId);
    const replacement = scopedInventory.find((it) => it.id === changeReplacementItemId);
    if (!damaged || !replacement) return;
    setChangeDraftItems((current) => [
      ...current,
      {
        damagedItemId: damaged.id,
        damagedSku: damaged.sku,
        damagedDescription: damaged.description,
        replacementItemId: replacement.id,
        replacementSku: replacement.sku,
        replacementDescription: replacement.description,
        replacementSize: replacement.size,
        quantity: qty,
      },
    ]);
    setChangeQty("1");
    setChangeDamagedItemId("");
    setChangeDamagedSearch("");
    setChangeReplacementItemId("");
    setChangeReplacementSearch("");
  };

  const removeDispatchDraftItem = (itemId: string) => {
    setDispatchDraftItems((current) => current.filter((item) => item.itemId !== itemId));
  };

  const removeRecoveryDraftItem = (itemId: string) => {
    setRecoveryDraftItems((current) => current.filter((item) => item.itemId !== itemId));
  };

  const removeChangeDraftItem = (index: number) => {
    setChangeDraftItems((current) => current.filter((_, i) => i !== index));
  };

  const validateEvidenceImage = (file: File | null): File | null => {
    if (!file) return null;
    if (!file.type.startsWith("image/")) {
      setFeedback("Solo se permiten imagenes como evidencia.");
      return null;
    }
    return file;
  };

  const handleEvidenceFileSelected = (
    file: File | null,
    setter: (nextFile: File | null) => void,
  ) => {
    const valid = validateEvidenceImage(file);
    if (!valid) return;
    setter(valid);
    setFeedback(`Imagen seleccionada: ${valid.name}`);
  };

  const handleEvidenceDrop = (
    event: DragEvent<HTMLDivElement>,
    setter: (nextFile: File | null) => void,
    draggingSetter: (isDragging: boolean) => void,
  ) => {
    event.preventDefault();
    draggingSetter(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    handleEvidenceFileSelected(droppedFile, setter);
  };

  const handleEvidencePaste = (
    event: ClipboardEvent<HTMLDivElement>,
    setter: (nextFile: File | null) => void,
  ) => {
    const pastedFile =
      Array.from(event.clipboardData.items)
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile() ?? null;
    if (!pastedFile) return;
    event.preventDefault();
    handleEvidenceFileSelected(pastedFile, setter);
  };

  const handleDispatch = async () => {
    try {
      setFeedback(null);
      if (!dispatchEmployeeId) throw new Error("Selecciona colaborador.");
      if (dispatchDraftItems.length === 0) throw new Error("Agrega al menos un articulo a la salida.");

      const selectedEmployee = employeeSource.find((emp) => emp.id === dispatchEmployeeId);
      if (!selectedEmployee) throw new Error("Selecciona colaborador.");
      let dbEmployee =
        allEmployees.find((emp) => emp.id === dispatchEmployeeId) ??
        allEmployees.find((emp) => emp.employeeCode === selectedEmployee.employeeCode);
      if (!dbEmployee) {
        throw new Error("El colaborador no esta sincronizado en Empleados. Guardalo desde la seccion de Colaboradores.");
      }

      const dispatchEvidenceUrl = dispatchEvidenceFile
        ? await uploadEvidence(dispatchEvidenceFile, `dispatches/${site}`)
        : undefined;

      const dispatchItems = dispatchDraftItems.map((draft) => {
        const item = scopedInventory.find((it) => it.id === draft.itemId);
        if (!item) throw new Error(`Item no encontrado: ${draft.sku}`);
        const availableStock = dispatchStockSource === "quantity" ? item.quantity : item.recoveredStock;
        if (availableStock < draft.quantity) throw new Error(`Stock insuficiente para ${draft.sku}.`);
        return { draft, item };
      });

      await dispatchMutation.mutateAsync({
        siteCode: site,
        employeeId: dbEmployee.id,
        proofUrl: dispatchEvidenceUrl,
      });

      for (const { draft, item } of dispatchItems) {
        await updateStock(item, draft.quantity, dispatchStockSource, "subtract");

        const label = `${item.sku} - ${item.description}`;
        try {
          await addCollaboratorHistory({
            employeeId: dbEmployee.id,
            siteCode: site,
            type: "salida",
            itemLabel: label,
            size: item.size,
            quantity: draft.quantity,
            note: `${dispatchKind} / stock:${dispatchStockSource}`,
          });
        } catch (historyError) {
          console.error("No se pudo registrar historial de colaborador:", historyError);
        }
      }

      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dispatches"] }),
          queryClient.invalidateQueries({ queryKey: ["inventory"] }),
          queryClient.invalidateQueries({ queryKey: ["collaborator-history"] }),
        ]);
      } catch (refreshError) {
        console.error("No se pudo refrescar informacion de salida:", refreshError);
      }

      try {
        const employee = allEmployees.find((emp) => emp.id === dbEmployee.id);
        if (employee) {
          const profiles = await listCollaboratorProfiles();
          const existing = profiles.find((p) => p.employeeId === employee.id);
          const nextProfile = {
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            siteCode: employee.siteCode,
            service: existing?.service ?? "",
            position: existing?.position ?? "",
            hireDate: existing?.hireDate ?? new Date().toISOString().slice(0, 10),
            lastRenewalDate:
              dispatchKind === "sin_motivo"
                ? existing?.lastRenewalDate
                : new Date().toISOString().slice(0, 10),
            shirtSize: existing?.shirtSize,
            pantsSize: existing?.pantsSize,
            shoeSize: existing?.shoeSize,
          };
          await upsertCollaboratorProfile(nextProfile);
        }
      } catch (profileError) {
        console.error("No se pudo actualizar perfil de colaborador:", profileError);
      }

      setDispatchDraftItems([]);
      setDispatchQty("1");
      setDispatchItemId("");
      setDispatchItemSearch("");
      setFeedback(`Salida registrada correctamente con ${dispatchItems.length} articulo(s).`);
    } catch (error) {
      setFeedback(getErrorMessage(error, "No se pudo registrar la salida."));
    }
  };

  const handleRecovery = async () => {
    try {
      setFeedback(null);
      if (!recoveryEmployeeId) throw new Error("Selecciona colaborador.");
      if (recoveryDraftItems.length === 0) throw new Error("Agrega al menos un articulo a recuperaciones.");

      const selectedEmployee = employeeSource.find((emp) => emp.id === recoveryEmployeeId);
      if (!selectedEmployee) throw new Error("Selecciona colaborador.");
      let dbEmployee =
        allEmployees.find((emp) => emp.id === recoveryEmployeeId) ??
        allEmployees.find((emp) => emp.employeeCode === selectedEmployee.employeeCode);
      if (!dbEmployee) {
        throw new Error("El colaborador no esta sincronizado en Empleados. Guardalo desde la seccion de Colaboradores.");
      }

      const recoveryItems = recoveryDraftItems.map((draft) => {
        const item = scopedInventory.find((it) => it.id === draft.itemId);
        if (!item) throw new Error(`Item no encontrado: ${draft.sku}`);
        return { draft, item };
      });

      const totalRecovered = recoveryItems.reduce((sum, row) => sum + row.draft.quantity, 0);
      await recoveryMutation.mutateAsync({
        siteCode: site,
        employeeId: dbEmployee.id,
        itemId: recoveryItems[0]?.draft.itemId,
        recoveredQty: totalRecovered,
        applyToInventory: recoveryMode === "ingreso_inventario",
        reason: `${recoveryMode === "desecho" ? "Desecho" : "Ingreso inventario"} - ${recoveryReason} (masivo: ${recoveryItems.length} articulos)`,
      });

      for (const { draft, item } of recoveryItems) {
        if (recoveryMode === "ingreso_inventario") {
          await updateStock(item, draft.quantity, "recovered", "add");
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recoveries"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      setRecoveryDraftItems([]);
      setRecoveryQty("1");
      setRecoveryItemId("");
      setRecoveryItemSearch("");
      setFeedback(`Recuperacion registrada correctamente con ${recoveryItems.length} articulo(s).`);
    } catch (error) {
      setFeedback(getErrorMessage(error, "No se pudo registrar la recuperacion."));
    }
  };

  const handleChange = async () => {
    try {
      setFeedback(null);
      if (!changeEmployeeId) throw new Error("Selecciona colaborador.");
      if (changeDraftItems.length === 0) throw new Error("Agrega al menos un cambio a la lista.");

      const selectedEmployee = employeeSource.find((emp) => emp.id === changeEmployeeId);
      if (!selectedEmployee) throw new Error("Selecciona colaborador.");
      let dbEmployee =
        allEmployees.find((emp) => emp.id === changeEmployeeId) ??
        allEmployees.find((emp) => emp.employeeCode === selectedEmployee.employeeCode);
      if (!dbEmployee) {
        throw new Error("El colaborador no esta sincronizado en Empleados. Guardalo desde la seccion de Colaboradores.");
      }

      const changeEvidenceUrl = changeEvidenceFile
        ? await uploadEvidence(changeEvidenceFile, `changes/${site}`)
        : undefined;

      const changeItems = changeDraftItems.map((draft) => {
        const replacementItem = scopedInventory.find((it) => it.id === draft.replacementItemId);
        if (!replacementItem) throw new Error(`No se encontro reemplazo: ${draft.replacementSku}`);
        return { draft, replacementItem };
      });

      await changeMutation.mutateAsync({
        siteCode: site,
        employeeId: dbEmployee.id,
        reason: `Cambio por dano masivo (${changeItems.length} articulos). Motivo: ${changeReason}.`,
        evidenceUrl: changeEvidenceUrl,
      });

      for (const { draft, replacementItem } of changeItems) {
        await updateStock(replacementItem, draft.quantity, changeStockSource, "subtract");
        await addCollaboratorHistory({
          employeeId: dbEmployee.id,
          siteCode: site,
          type: "cambio",
          itemLabel: `${replacementItem.sku} - ${replacementItem.description}`,
          size: replacementItem.size,
          quantity: draft.quantity,
          note: `Cambio por dano / stock:${changeStockSource}`,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["changes"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["collaborator-history"] }),
      ]);
      setChangeDraftItems([]);
      setChangeQty("1");
      setChangeDamagedItemId("");
      setChangeDamagedSearch("");
      setChangeReplacementItemId("");
      setChangeReplacementSearch("");
      setFeedback(`Cambio por dano registrado correctamente con ${changeItems.length} articulo(s).`);
    } catch (error) {
      setFeedback(getErrorMessage(error, "No se pudo registrar el cambio."));
    }
  };

  const handleDeleteHistoryRow = async (rowId: string) => {
    if (!isAdmin) return;
    if (!window.confirm("¿Eliminar este registro?")) return;
    try {
      setFeedback(null);
      if (activeTab === "entradas") {
        await deleteEntryMutation.mutateAsync(rowId);
        await queryClient.invalidateQueries({ queryKey: ["entries"] });
      } else if (activeTab === "salidas") {
        await deleteDispatchMutation.mutateAsync(rowId);
        await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      } else {
        setFeedback("Eliminar disponible solo para Entradas y Salidas.");
        return;
      }
      setFeedback("Registro eliminado.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "No se pudo eliminar el registro."));
    }
  };

  return (
    <section>
      <h1>Operacion diaria</h1>
      {feedback ? <ToastMessage message={feedback} kind="info" onClose={() => setFeedback(null)} /> : null}

      <article className="card">
        <div className="row">
          <strong>Subpestanas</strong>
          <button type="button" onClick={() => { setActiveTab("entradas"); setHistoryPage(1); }}>Entradas ({counters.entradas})</button>
          <button type="button" onClick={() => { setActiveTab("salidas"); setHistoryPage(1); }}>Salidas ({counters.salidas})</button>
          <button type="button" onClick={() => { setActiveTab("recuperaciones"); setHistoryPage(1); }}>Recuperaciones ({counters.recuperaciones})</button>
          <button type="button" onClick={() => { setActiveTab("cambio"); setHistoryPage(1); }}>Cambio por dano ({counters.cambios})</button>
        </div>
        <div className="row">
          <label className="form-field">
            <span>Sitio operativo</span>
            <select value={site} onChange={(e) => setSite(e.target.value as SiteCode)} disabled={!isAdmin}>
              {allSites.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {activeTab === "entradas" ? (
        <article className="card">
          <h3>Entradas</h3>
          <p>Escanea o captura SKU manualmente y suma stock al inventario del sitio.</p>
          <p className="muted">
            Mostrando articulos de: {site} ({scopedInventory.length})
          </p>
          {inventory.isLoading ? <p className="muted">Cargando inventario...</p> : null}
          {inventory.isError ? <p className="muted">No se pudo cargar inventario para sugerencias.</p> : null}
          {!inventory.isLoading && scopedInventory.length === 0 && allInventory.length > 0 ? (
            <p className="muted">No hay articulos en este sitio. Mostrando sugerencias de otros sitios.</p>
          ) : null}
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>SKU (escaneado o manual)</span>
              <input
                value={entrySku}
                onChange={(e) => {
                  setEntrySku(e.target.value);
                  setEntrySelectedItemId("");
                }}
                placeholder="Ej. BOT-001 o descripcion"
              />
              {isEntrySearching && entryCandidates.length === 0 ? (
                <span className="muted">Sin coincidencia exacta. Mostrando sugerencias del sitio.</span>
              ) : null}
              {entrySelected ? (
                <span className="muted">
                  Seleccionado: {entrySelected.sku} - {entrySelected.description} ({entrySelected.size ?? "N/A"})
                </span>
              ) : null}
              <span className="muted">Previsualizacion de articulos del sitio (lista vertical):</span>
              {entryPreviewItems.length > 0 ? (
                <div className="suggestions-list">
                  {entryPreviewItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setEntrySelectedItemId(item.id);
                        setEntrySku(item.sku);
                      }}
                    >
                      <strong>{item.sku}</strong>
                      <span className="suggestion-description">{item.description}</span>
                      <small className="muted">
                        Talla: {item.size ?? "N/A"} | Stock: {item.quantity} | Recuperado: {item.recoveredStock}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="form-field">
              <span>Stock a ingresar</span>
              <input type="number" min={1} value={entryQty} onChange={(e) => setEntryQty(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Notas</span>
              <input value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="Opcional" />
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={handleAddEntryDraft}>Agregar a lista</button>
            <button type="button" onClick={() => void handleCreateEntry()} disabled={entryDraftItems.length === 0}>
              Registrar entrada masiva
            </button>
          </div>
          {entryDraftItems.length > 0 ? (
            <div className="entry-draft-list">
              <strong>Articulos por ingresar</strong>
              {entryDraftItems.map((draft) => (
                <div key={draft.itemId} className="entry-draft-row">
                  <span>
                    {draft.sku} - {draft.description} ({draft.size ?? "N/A"}) x {draft.quantity}
                  </span>
                  <button type="button" onClick={() => handleRemoveEntryDraft(draft.itemId)}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No hay articulos en la lista de entrada.</p>
          )}
        </article>
      ) : null}

      {activeTab === "salidas" ? (
        <article className="card">
          <h3>Salidas y comprobantes</h3>
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>Buscar colaborador (nombre o ID)</span>
              <input value={dispatchEmployeeSearch} onChange={(e) => setDispatchEmployeeSearch(e.target.value)} />
              {dispatchEmployeePreview.length > 0 ? (
                <div className="suggestions-list">
                  {dispatchEmployeePreview.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setDispatchEmployeeId(emp.id);
                        setDispatchEmployeeSearch(`${emp.employeeCode} - ${emp.fullName}`);
                      }}
                    >
                      <strong>{emp.employeeCode}</strong>
                      <span className="suggestion-description">{emp.fullName}</span>
                      <small className="muted">Servicio: {emp.service ?? "-"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              {dispatchEmployeePreview.length === 0 ? (
                <span className="muted">Sin colaboradores disponibles.</span>
              ) : null}
              {dispatchEmployeeSelected ? (
                <span className="muted">Seleccionado: {dispatchEmployeeSelected.employeeCode} - {dispatchEmployeeSelected.fullName}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Tipo de salida</span>
              <select
                value={dispatchKind}
                onChange={(e) =>
                  setDispatchKind(e.target.value as "renovacion" | "segundo_uniforme" | "sin_motivo")
                }
              >
                <option value="renovacion">Renovacion de uniforme</option>
                <option value="segundo_uniforme">2do uniforme</option>
                <option value="sin_motivo">Sin motivo</option>
              </select>
            </label>
            <label className="form-field">
              <span>Stock a descontar</span>
              <select value={dispatchStockSource} onChange={(e) => setDispatchStockSource(e.target.value as StockSource)}>
                <option value="quantity">Stock principal</option>
                <option value="recovered">Stock recuperado</option>
              </select>
            </label>
            <label className="form-field">
              <span>Buscar item (SKU o nombre)</span>
              <input value={dispatchItemSearch} onChange={(e) => setDispatchItemSearch(e.target.value)} />
              {dispatchItemPreview.length > 0 ? (
                <div className="suggestions-list">
                  {dispatchItemPreview.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setDispatchItemId(item.id);
                        setDispatchItemSearch(item.sku);
                      }}
                    >
                      <strong>{item.sku}</strong>
                      <span className="suggestion-description">{item.description}</span>
                      <small className="muted">
                        Talla: {item.size ?? "N/A"} | Stock: {item.quantity} | Recuperado: {item.recoveredStock}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
              {dispatchItemSelected ? (
                <span className="muted">Seleccionado: {dispatchItemSelected.sku} - {dispatchItemSelected.description}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Cantidad</span>
              <input type="number" min={1} value={dispatchQty} onChange={(e) => setDispatchQty(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Evidencia (imagen)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleEvidenceFileSelected(e.target.files?.[0] ?? null, setDispatchEvidenceFile)}
              />
              <div
                className={`evidence-dropzone ${isDispatchEvidenceDragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDispatchEvidenceDragging(true);
                }}
                onDragLeave={() => setIsDispatchEvidenceDragging(false)}
                onDrop={(e) => handleEvidenceDrop(e, setDispatchEvidenceFile, setIsDispatchEvidenceDragging)}
                onPaste={(e) => handleEvidencePaste(e, setDispatchEvidenceFile)}
                tabIndex={0}
              >
                Arrastra una imagen aqui o pega con Ctrl+V
              </div>
              {dispatchEvidenceFile ? (
                <span className="muted">Seleccionada: {dispatchEvidenceFile.name}</span>
              ) : (
                <span className="muted">Sin imagen seleccionada.</span>
              )}
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={handleAddDispatchDraft}>Agregar articulo</button>
            <button type="button" onClick={() => void handleDispatch()} disabled={dispatchDraftItems.length === 0}>
              Finalizar salida masiva
            </button>
          </div>
          {dispatchDraftItems.length > 0 ? (
            <div className="entry-draft-list">
              <strong>Articulos de salida</strong>
              {dispatchDraftItems.map((draft) => (
                <div key={draft.itemId} className="entry-draft-row">
                  <span>{draft.sku} - {draft.description} x {draft.quantity}</span>
                  <button type="button" onClick={() => removeDispatchDraftItem(draft.itemId)}>Quitar</button>
                </div>
              ))}
              <button type="button" onClick={() => setDispatchDraftItems([])}>Vaciar lista</button>
            </div>
          ) : null}
        </article>
      ) : null}

      {activeTab === "recuperaciones" ? (
        <article className="card">
          <h3>Recuperaciones</h3>
          <p>Fecha del registro: {new Date().toLocaleString()}</p>
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>Buscar colaborador (nombre o ID)</span>
              <input value={recoveryEmployeeSearch} onChange={(e) => setRecoveryEmployeeSearch(e.target.value)} />
              {recoveryEmployeePreview.length > 0 ? (
                <div className="suggestions-list">
                  {recoveryEmployeePreview.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setRecoveryEmployeeId(emp.id);
                        setRecoveryEmployeeSearch(`${emp.employeeCode} - ${emp.fullName}`);
                      }}
                    >
                      <strong>{emp.employeeCode}</strong>
                      <span className="suggestion-description">{emp.fullName}</span>
                      <small className="muted">Servicio: {emp.service ?? "-"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              {recoveryEmployeePreview.length === 0 ? (
                <span className="muted">Sin colaboradores disponibles.</span>
              ) : null}
              {recoveryEmployeeSelected ? (
                <span className="muted">Seleccionado: {recoveryEmployeeSelected.employeeCode} - {recoveryEmployeeSelected.fullName}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Buscar item (SKU o descripcion)</span>
              <input value={recoveryItemSearch} onChange={(e) => setRecoveryItemSearch(e.target.value)} />
              {recoveryItemPreview.length > 0 ? (
                <div className="suggestions-list">
                  {recoveryItemPreview.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setRecoveryItemId(item.id);
                        setRecoveryItemSearch(item.sku);
                      }}
                    >
                      <strong>{item.sku}</strong>
                      <span className="suggestion-description">{item.description}</span>
                      <small className="muted">
                        Talla: {item.size ?? "N/A"} | Stock: {item.quantity} | Recuperado: {item.recoveredStock}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
              {recoveryItemSelected ? (
                <span className="muted">Seleccionado: {recoveryItemSelected.sku} - {recoveryItemSelected.description}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Cantidad</span>
              <input type="number" min={1} value={recoveryQty} onChange={(e) => setRecoveryQty(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Modo</span>
              <select value={recoveryMode} onChange={(e) => setRecoveryMode(e.target.value as RecoveryMode)}>
                <option value="desecho">Desecho (solo registro)</option>
                <option value="ingreso_inventario">Ingreso a inventario (stock recuperado)</option>
              </select>
            </label>
            <label className="form-field">
              <span>Motivo</span>
              <input value={recoveryReason} onChange={(e) => setRecoveryReason(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={handleAddRecoveryDraft}>Agregar articulo</button>
            <button type="button" onClick={() => void handleRecovery()} disabled={recoveryDraftItems.length === 0}>
              Guardar recuperacion masiva
            </button>
          </div>
          {recoveryDraftItems.length > 0 ? (
            <div className="entry-draft-list">
              <strong>Articulos de recuperacion</strong>
              {recoveryDraftItems.map((draft) => (
                <div key={draft.itemId} className="entry-draft-row">
                  <span>{draft.sku} - {draft.description} x {draft.quantity}</span>
                  <button type="button" onClick={() => removeRecoveryDraftItem(draft.itemId)}>Quitar</button>
                </div>
              ))}
              <button type="button" onClick={() => setRecoveryDraftItems([])}>Vaciar lista</button>
            </div>
          ) : null}
        </article>
      ) : null}

      {activeTab === "cambio" ? (
        <article className="card">
          <h3>Cambio por dano</h3>
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>Buscar colaborador</span>
              <input value={changeEmployeeSearch} onChange={(e) => setChangeEmployeeSearch(e.target.value)} />
              {changeEmployeePreview.length > 0 ? (
                <div className="suggestions-list">
                  {changeEmployeePreview.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setChangeEmployeeId(emp.id);
                        setChangeEmployeeSearch(`${emp.employeeCode} - ${emp.fullName}`);
                      }}
                    >
                      <strong>{emp.employeeCode}</strong>
                      <span className="suggestion-description">{emp.fullName}</span>
                      <small className="muted">Servicio: {emp.service ?? "-"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              {changeEmployeePreview.length === 0 ? (
                <span className="muted">Sin colaboradores disponibles.</span>
              ) : null}
              {changeEmployeeSelected ? (
                <span className="muted">Seleccionado: {changeEmployeeSelected.employeeCode} - {changeEmployeeSelected.fullName}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Buscar item danado</span>
              <input value={changeDamagedSearch} onChange={(e) => setChangeDamagedSearch(e.target.value)} />
              {changeDamagedPreview.length > 0 ? (
                <div className="suggestions-list">
                  {changeDamagedPreview.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setChangeDamagedItemId(item.id);
                        setChangeDamagedSearch(item.sku);
                      }}
                    >
                      <strong>{item.sku}</strong>
                      <span className="suggestion-description">{item.description}</span>
                      <small className="muted">
                        Talla: {item.size ?? "N/A"} | Stock: {item.quantity} | Recuperado: {item.recoveredStock}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
              {changeDamagedSelected ? (
                <span className="muted">Seleccionado: {changeDamagedSelected.sku} - {changeDamagedSelected.description}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Buscar item reemplazo</span>
              <input value={changeReplacementSearch} onChange={(e) => setChangeReplacementSearch(e.target.value)} />
              {changeReplacementPreview.length > 0 ? (
                <div className="suggestions-list">
                  {changeReplacementPreview.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="suggestion-item"
                      onClick={() => {
                        setChangeReplacementItemId(item.id);
                        setChangeReplacementSearch(item.sku);
                      }}
                    >
                      <strong>{item.sku}</strong>
                      <span className="suggestion-description">{item.description}</span>
                      <small className="muted">
                        Talla: {item.size ?? "N/A"} | Stock: {item.quantity} | Recuperado: {item.recoveredStock}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}
              {changeReplacementSelected ? (
                <span className="muted">Seleccionado: {changeReplacementSelected.sku} - {changeReplacementSelected.description}</span>
              ) : null}
            </label>
            <label className="form-field">
              <span>Descontar de</span>
              <select value={changeStockSource} onChange={(e) => setChangeStockSource(e.target.value as StockSource)}>
                <option value="quantity">Stock principal</option>
                <option value="recovered">Stock recuperado</option>
              </select>
            </label>
            <label className="form-field">
              <span>Cantidad de reemplazo</span>
              <input type="number" min={1} value={changeQty} onChange={(e) => setChangeQty(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Motivo</span>
              <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Evidencia (imagen)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleEvidenceFileSelected(e.target.files?.[0] ?? null, setChangeEvidenceFile)}
              />
              <div
                className={`evidence-dropzone ${isChangeEvidenceDragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsChangeEvidenceDragging(true);
                }}
                onDragLeave={() => setIsChangeEvidenceDragging(false)}
                onDrop={(e) => handleEvidenceDrop(e, setChangeEvidenceFile, setIsChangeEvidenceDragging)}
                onPaste={(e) => handleEvidencePaste(e, setChangeEvidenceFile)}
                tabIndex={0}
              >
                Arrastra una imagen aqui o pega con Ctrl+V
              </div>
              {changeEvidenceFile ? (
                <span className="muted">Seleccionada: {changeEvidenceFile.name}</span>
              ) : (
                <span className="muted">Sin imagen seleccionada.</span>
              )}
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={handleAddChangeDraft}>Agregar cambio</button>
            <button type="button" onClick={() => void handleChange()} disabled={changeDraftItems.length === 0}>
              Guardar cambio masivo
            </button>
          </div>
          {changeDraftItems.length > 0 ? (
            <div className="entry-draft-list">
              <strong>Cambios por dano</strong>
              {changeDraftItems.map((draft, idx) => (
                <div key={`${draft.damagedItemId}-${draft.replacementItemId}-${idx}`} className="entry-draft-row">
                  <span>Danado: {draft.damagedSku} {"->"} Reemplazo: {draft.replacementSku} x {draft.quantity}</span>
                  <button type="button" onClick={() => removeChangeDraftItem(idx)}>Quitar</button>
                </div>
              ))}
              <button type="button" onClick={() => setChangeDraftItems([])}>Vaciar lista</button>
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="card">
        <h3>Historial operativo ({activeTab})</h3>
        <div className="inventory-form-grid">
          <label className="form-field">
            <span>Buscar</span>
            <input
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Texto, colaborador, evidencia, motivo..."
            />
          </label>
          <label className="form-field">
            <span>Desde</span>
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => {
                setHistoryFrom(e.target.value);
                setHistoryPage(1);
              }}
            />
          </label>
          <label className="form-field">
            <span>Hasta</span>
            <input
              type="date"
              value={historyTo}
              onChange={(e) => {
                setHistoryTo(e.target.value);
                setHistoryPage(1);
              }}
            />
          </label>
          <label className="form-field">
            <span>Orden</span>
            <select
              value={historySort}
              onChange={(e) => {
                setHistorySort(e.target.value as "newest" | "oldest");
                setHistoryPage(1);
              }}
            >
              <option value="newest">Mas recientes</option>
              <option value="oldest">Mas antiguos</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={exportHistoryCsv}>Exportar historial CSV</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Detalle</th>
              <th>Info</th>
              {isAdmin && (activeTab === "entradas" || activeTab === "salidas") ? <th>Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {paginatedHistory.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className={`op-badge op-${row.type}`}>
                    {row.type.toUpperCase()}
                  </span>
                </td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.main}</td>
                <td>{row.secondary}</td>
                {isAdmin && (activeTab === "entradas" || activeTab === "salidas") ? (
                  <td>
                    <button type="button" onClick={() => void handleDeleteHistoryRow(row.id)}>
                      Eliminar
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button type="button" disabled={safePage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span>Pagina {safePage} de {totalPages}</span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      </article>
    </section>
  );
}
