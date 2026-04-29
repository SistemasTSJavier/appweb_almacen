import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteEmployee, ensureEmployee, listEmployees, updateEmployeeCode } from "../services/domain-service";
import {
  deleteCollaboratorProfile,
  listCollaboratorHistory,
  listCollaboratorProfiles,
  upsertCollaboratorProfile,
} from "../services/collaborator-profile-service";
import { useSessionStore } from "../state/use-session-store";
import { ToastMessage } from "../shared/toast-message";
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

function findHeaderIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const exact = headers.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const partial = headers.findIndex((h) => h.includes(alias) || alias.includes(h));
    if (partial >= 0) return partial;
  }
  return -1;
}

function normalizeDateInput(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parts = value.split(/[\/\-\.]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return value;

  const [d, m, y] = parts;
  if (!d || !m || !y) return value;
  const day = d.padStart(2, "0");
  const month = m.padStart(2, "0");
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${month}-${day}`;
}

function getNextPendingCode(existingCodes: string[]) {
  const nums = existingCodes
    .map((code) => (code.startsWith("PTE-") ? Number(code.replace("PTE-", "")) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `PTE-${next}`;
}

function getSecondUniformDate(hireDate: string) {
  const base = new Date(hireDate);
  if (Number.isNaN(base.getTime())) return "N/A";

  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  // Regla: si ingreso del 1 al 15 -> se recorre al 30.
  // Si ingreso del 16 al 31 -> se recorre al 15 del siguiente corte.
  if (day <= 15) {
    return new Date(year, month, 30).toLocaleDateString();
  }
  return new Date(year, month + 1, 15).toLocaleDateString();
}

function getNextRenewal(hireDate: string) {
  const next = getNextRenewalDate(hireDate);
  return next ? next.toLocaleDateString() : "N/A";
}

function getNextRenewalDate(baseDate: string): Date | null {
  const base = new Date(baseDate);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  while (next <= new Date()) next.setMonth(next.getMonth() + 6);
  return next;
}

function getRenewalStatus(baseDate: string) {
  const next = getNextRenewalDate(baseDate);
  if (!next) return { label: "Sin fecha", kind: "renewal-vencido" };
  const diffDays = Math.ceil((next.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { label: "Vencido", kind: "renewal-vencido" };
  if (diffDays <= 30) return { label: "30 dias", kind: "renewal-30" };
  if (diffDays <= 60) return { label: "60 dias", kind: "renewal-60" };
  return { label: "OK", kind: "renewal-ok" };
}

export function CollaboratorsPage() {
  const currentUser = useSessionStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === "admin";
  const defaultSite = currentUser?.siteCode ?? "CEDIS";
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [renewalFilter, setRenewalFilter] = useState<"all" | "vencidos" | "proximos_30" | "proximos_60">("all");
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formName, setFormName] = useState("");
  const [formService, setFormService] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formHireDate, setFormHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [formLastRenewalDate, setFormLastRenewalDate] = useState("");
  const [formShirt, setFormShirt] = useState("");
  const [formPants, setFormPants] = useState("");
  const [formShoes, setFormShoes] = useState("");
  const [pendingCodeEdits, setPendingCodeEdits] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const employees = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const profilesQuery = useQuery({ queryKey: ["collaborator-profiles"], queryFn: listCollaboratorProfiles });
  const historyQuery = useQuery({ queryKey: ["collaborator-history"], queryFn: listCollaboratorHistory });

  const profiles = profilesQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const mergedCollaborators = useMemo(() => {
    const base = employees.data ?? [];
    const mapped = base.map((employee) => {
      const profile = profiles.find((p) => p.employeeId === employee.id);
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        siteCode: employee.siteCode,
        service: profile?.service ?? "",
        position: profile?.position ?? "",
        hireDate: profile?.hireDate ?? new Date().toISOString().slice(0, 10),
        lastRenewalDate: profile?.lastRenewalDate ?? "",
        shirtSize: profile?.shirtSize ?? "-",
        pantsSize: profile?.pantsSize ?? "-",
        shoeSize: profile?.shoeSize ?? "-",
      };
    });
    const localsOnly = profiles.filter(
      (profile) => !base.some((employee) => employee.id === profile.employeeId),
    );
    return [...mapped, ...localsOnly];
  }, [employees.data, profiles]);

  const scopedCollaborators = mergedCollaborators;

  const normalizeText = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const collaboratorPreview = [...scopedCollaborators]
    .map((item) => {
      const term = normalizeText(collaboratorSearch);
      if (!term) return { item, score: 1 };
      const tokens = term.split(" ").filter(Boolean);
      const codeText = normalizeText(item.employeeCode);
      const nameText = normalizeText(item.fullName);
      const serviceText = normalizeText(item.service || "");
      const positionText = normalizeText(item.position || "");
      const searchable = `${codeText} ${nameText} ${serviceText} ${positionText}`.trim();
      let score = 0;
      if (codeText.startsWith(term)) score += 40;
      if (nameText.startsWith(term)) score += 35;
      if (searchable.includes(term)) score += 15;
      for (const token of tokens) {
        if (codeText.includes(token)) score += 10;
        if (nameText.includes(token)) score += 9;
        if (serviceText.includes(token)) score += 6;
        if (positionText.includes(token)) score += 6;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.employeeCode.localeCompare(b.item.employeeCode))
    .map((row) => row.item);

  const serviceOptions = useMemo(() => {
    const values = Array.from(new Set(scopedCollaborators.map((item) => item.service).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [scopedCollaborators]);

  const filteredCollaborators = useMemo(() => {
    const now = new Date();
    return collaboratorPreview.filter((item) => {
      if (serviceFilter !== "ALL" && item.service !== serviceFilter) return false;
      if (renewalFilter === "all") return true;
      const nextRenewal = getNextRenewalDate(item.lastRenewalDate || item.hireDate);
      if (!nextRenewal) return renewalFilter === "vencidos";
      const diffDays = Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (renewalFilter === "vencidos") return diffDays <= 0;
      if (renewalFilter === "proximos_30") return diffDays > 0 && diffDays <= 30;
      if (renewalFilter === "proximos_60") return diffDays > 0 && diffDays <= 60;
      return true;
    });
  }, [collaboratorPreview, renewalFilter, serviceFilter]);

  const pendingIdCollaborators = useMemo(
    () => scopedCollaborators.filter((item) => !item.employeeCode || item.employeeCode.startsWith("PTE-")),
    [scopedCollaborators],
  );

  const selectedHistory = history
    .filter((event) => event.employeeId === selectedEmployeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const onSaveCollaborator = async () => {
    setFeedback(null);
    const name = formName.trim();
    if (!name) {
      setFeedback("El nombre completo es obligatorio.");
      return;
    }

    const existingCodes = mergedCollaborators.map((item) => item.employeeCode);
    const employeeCode = formEmployeeId.trim() || getNextPendingCode(existingCodes);
    const siteCode = defaultSite;
    const ensuredEmployee = await ensureEmployee({
      employeeCode,
      fullName: name,
      siteCode,
    });
    const employeeId = ensuredEmployee.id;

    await upsertCollaboratorProfile({
      employeeId,
      employeeCode,
      fullName: name,
      siteCode,
      service: formService.trim(),
      position: formPosition.trim(),
      hireDate: formHireDate,
      lastRenewalDate: formLastRenewalDate.trim() || undefined,
      shirtSize: formShirt.trim() || undefined,
      pantsSize: formPants.trim() || undefined,
      shoeSize: formShoes.trim() || undefined,
    });
    await profilesQuery.refetch();
    await employees.refetch();
    setSelectedEmployeeId(employeeId);
    setFeedback(
      formEmployeeId.trim()
        ? "Colaborador guardado correctamente."
        : `Colaborador guardado con ID ${employeeCode}.`,
    );
  };

  const onImportCollaboratorsCsv = async (file: File) => {
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
      const codeIndex = findHeaderIndex(headers, ["id colaborador", "employee_code", "id"]);
      const nameIndex = findHeaderIndex(headers, ["nombre completo", "full_name", "nombre"]);
      const idxService = findHeaderIndex(headers, ["servicio", "service"]);
      const idxPosition = findHeaderIndex(headers, ["puesto", "posicion", "position"]);
      const idxSite = findHeaderIndex(headers, ["sitio", "site"]);
      const idxHireDate = findHeaderIndex(headers, ["fecha de ingreso", "fecha ingreso", "hire date", "hire_date"]);
      const idxLastRenewal = findHeaderIndex(headers, ["fecha ultima renovacion", "fecha ultima renov", "ultima renovacion", "last renewal", "last_renewal_date"]);
      const idxShirt = findHeaderIndex(headers, ["talla camisa", "camisa"]);
      const idxPants = findHeaderIndex(headers, ["talla pantalon", "pantalon"]);
      const idxShoes = findHeaderIndex(headers, ["talla zapato", "zapato"]);
      if (
        codeIndex < 0 ||
        nameIndex < 0 ||
        idxService < 0 ||
        idxPosition < 0 ||
        idxHireDate < 0 ||
        idxLastRenewal < 0 ||
        idxShirt < 0 ||
        idxPants < 0 ||
        idxShoes < 0
      ) {
        setFeedback("CSV invalido. Columnas requeridas: ID colaborador, Nombre Completo, Servicio, Puesto, Fecha de ingreso, Fecha ultima renovacion, Talla camisa, Talla pantalon y Talla zapato.");
        return;
      }

      let processed = 0;
      let skipped = 0;
      const reservedCodes = new Set(mergedCollaborators.map((item) => item.employeeCode));
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i], delimiter);
        const csvEmployeeCode = (cols[codeIndex] ?? "").trim();
        const fullName = (cols[nameIndex] ?? "").trim();
        if (!fullName) {
          skipped += 1;
          continue;
        }

        const employeeCode = csvEmployeeCode || getNextPendingCode(Array.from(reservedCodes));
        reservedCodes.add(employeeCode);

        const siteRaw = idxSite >= 0 ? (cols[idxSite] ?? "").trim().toUpperCase() : "";
        const hireDateValue = idxHireDate >= 0 ? normalizeDateInput(cols[idxHireDate] ?? "") : "";
        const lastRenewalValue = idxLastRenewal >= 0 ? normalizeDateInput(cols[idxLastRenewal] ?? "") : "";
        const siteCode: SiteCode =
          siteRaw === "CEDIS" || siteRaw === "ACUNA" || siteRaw === "NLD"
            ? (siteRaw as SiteCode)
            : defaultSite;

        const ensuredEmployee = await ensureEmployee({
          employeeCode,
          fullName,
          siteCode,
        });
        const existing = profiles.find((p) => p.employeeId === ensuredEmployee.id);

        await upsertCollaboratorProfile({
          employeeId: ensuredEmployee.id,
          employeeCode,
          fullName,
          siteCode,
          service: (cols[idxService] ?? "").trim() || (existing?.service ?? ""),
          position: (cols[idxPosition] ?? "").trim() || (existing?.position ?? ""),
          hireDate: hireDateValue || existing?.hireDate || new Date().toISOString().slice(0, 10),
          lastRenewalDate:
            lastRenewalValue ||
            hireDateValue ||
            existing?.lastRenewalDate ||
            existing?.hireDate,
          shirtSize: (cols[idxShirt] ?? "").trim() || existing?.shirtSize,
          pantsSize: (cols[idxPants] ?? "").trim() || existing?.pantsSize,
          shoeSize: (cols[idxShoes] ?? "").trim() || existing?.shoeSize,
        });
        processed += 1;
      }

      await Promise.all([employees.refetch(), profilesQuery.refetch()]);
      if (processed === 0) {
        setFeedback("No se importo ningun colaborador. Revisa que el CSV tenga Nombre Completo con datos en las filas.");
        return;
      }
      setFeedback(`Importacion completada. Procesados: ${processed}. Omitidos: ${skipped}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo importar el CSV de colaboradores.");
    }
  };

  const onLoadCollaborator = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const item = scopedCollaborators.find((it) => it.employeeId === employeeId);
    if (!item) return;
    setFormEmployeeId(item.employeeCode);
    setFormName(item.fullName);
    setFormService(item.service);
    setFormPosition(item.position ?? "");
    setFormHireDate(item.hireDate);
    setFormLastRenewalDate(item.lastRenewalDate ?? "");
    setFormShirt(item.shirtSize === "-" ? "" : item.shirtSize);
    setFormPants(item.pantsSize === "-" ? "" : item.pantsSize);
    setFormShoes(item.shoeSize === "-" ? "" : item.shoeSize);
  };

  const onDeleteCollaborator = async () => {
    if (!isAdmin || !selectedEmployeeId) return;
    if (!window.confirm("¿Eliminar colaborador seleccionado?")) return;
    try {
      setFeedback(null);
      await deleteCollaboratorProfile(selectedEmployeeId);
      await deleteEmployee(selectedEmployeeId);
      await Promise.all([employees.refetch(), profilesQuery.refetch()]);
      setSelectedEmployeeId("");
      setFeedback("Colaborador eliminado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el colaborador.");
    }
  };

  const exportCollaboratorsCsv = () => {
    const rows = scopedCollaborators;
    if (rows.length === 0) {
      setFeedback("No hay colaboradores para exportar.");
      return;
    }
    const header = [
      "ID colaborador",
      "Nombre Completo",
      "Servicio",
      "Puesto",
      "Fecha de ingreso",
      "Fecha ultima renovacion",
      "Talla camisa",
      "Talla pantalon",
      "Talla zapato",
    ];
    const esc = (value: string | number) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = rows
      .slice()
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
      .map((item) => [
        esc(item.employeeCode),
        esc(item.fullName),
        esc(item.service || ""),
        esc(item.position || ""),
        esc(item.hireDate || ""),
        esc(item.lastRenewalDate || ""),
        esc(item.shirtSize || ""),
        esc(item.pantsSize || ""),
        esc(item.shoeSize || ""),
      ]);
    const csv = [header.join(","), ...body.map((line) => line.join(","))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `colaboradores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback(`CSV exportado. Registros: ${rows.length}.`);
  };

  const exportPendingCsv = () => {
    if (pendingIdCollaborators.length === 0) {
      setFeedback("No hay colaboradores pendientes por exportar.");
      return;
    }
    const header = ["ID temporal", "Nombre Completo", "Servicio", "Puesto"];
    const esc = (value: string | number) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const body = pendingIdCollaborators.map((item) => [
      esc(item.employeeCode),
      esc(item.fullName),
      esc(item.service || ""),
      esc(item.position || ""),
    ]);
    const csv = [header.join(","), ...body.map((line) => line.join(","))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `colaboradores-pendientes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback(`Pendientes exportados: ${pendingIdCollaborators.length}.`);
  };

  const savePendingEmployeeCode = async (employeeId: string) => {
    const value = (pendingCodeEdits[employeeId] ?? "").trim();
    if (!value) {
      setFeedback("Captura el ID definitivo para guardar.");
      return;
    }
    try {
      setFeedback(null);
      await updateEmployeeCode(employeeId, value);
      const profile = profiles.find((p) => p.employeeId === employeeId);
      if (profile) {
        await upsertCollaboratorProfile({
          ...profile,
          employeeCode: value,
        });
      }
      await Promise.all([employees.refetch(), profilesQuery.refetch()]);
      setPendingCodeEdits((current) => {
        const next = { ...current };
        delete next[employeeId];
        return next;
      });
      setFeedback("ID colaborador actualizado correctamente.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el ID del colaborador.");
    }
  };

  const selected = scopedCollaborators.find((item) => item.employeeId === selectedEmployeeId);

  return (
    <section>
      <h1>Colaboradores</h1>
      {feedback ? <ToastMessage message={feedback} kind="info" onClose={() => setFeedback(null)} /> : null}
      <div className="collaborators-layout">
        <div className="collaborators-main">
        <article id="colaboradores-alta" className="card">
          <h3>Alta / Edicion</h3>
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>ID colaborador</span>
              <input
                value={formEmployeeId}
                onChange={(e) => setFormEmployeeId(e.target.value)}
                placeholder="Si se deja vacio: PTE-*"
                disabled={!isAdmin && Boolean(selectedEmployeeId)}
              />
            </label>
            <label className="form-field">
              <span>Nombre completo</span>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Servicio</span>
              <input value={formService} onChange={(e) => setFormService(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Puesto</span>
              <input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Fecha de ingreso</span>
              <input type="date" value={formHireDate} onChange={(e) => setFormHireDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Fecha ultima renovacion</span>
              <input
                type="date"
                value={formLastRenewalDate}
                onChange={(e) => setFormLastRenewalDate(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Talla camisa</span>
              <input value={formShirt} onChange={(e) => setFormShirt(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Talla pantalon</span>
              <input value={formPants} onChange={(e) => setFormPants(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Talla zapato</span>
              <input value={formShoes} onChange={(e) => setFormShoes(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button type="button" onClick={onSaveCollaborator}>Guardar colaborador</button>
            <button type="button" onClick={exportCollaboratorsCsv}>Exportar colaboradores CSV</button>
            {isAdmin ? (
              <button type="button" onClick={() => void onDeleteCollaborator()} disabled={!selectedEmployeeId}>
                Eliminar colaborador
              </button>
            ) : null}
            <label className="form-field" style={{ minWidth: "260px" }}>
              <span>Importar colaboradores CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImportCollaboratorsCsv(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <p className="muted">Fecha 2do uniforme: {getSecondUniformDate(formHireDate)}</p>
          <p className="muted">Proxima renovacion (cada 6 meses): {getNextRenewal(formLastRenewalDate || formHireDate)}</p>
        </article>

        <article id="colaboradores-listado" className="card">
          <h3>Listado y vista previa</h3>
          <div className="inventory-form-grid">
            <label className="form-field">
              <span>Buscar colaborador (ID, nombre, servicio o puesto)</span>
              <input
                value={collaboratorSearch}
                onChange={(e) => setCollaboratorSearch(e.target.value)}
                placeholder="Ej. E001, Juan o Seguridad"
              />
            </label>
            <label className="form-field">
              <span>Filtro de servicio</span>
              <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                <option value="ALL">Todos</option>
                {serviceOptions.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Próxima renovación</span>
              <select
                value={renewalFilter}
                onChange={(e) => setRenewalFilter(e.target.value as "all" | "vencidos" | "proximos_30" | "proximos_60")}
              >
                <option value="all">Todos</option>
                <option value="vencidos">Vencidos / hoy</option>
                <option value="proximos_30">Próximos 30 días</option>
                <option value="proximos_60">Próximos 60 días</option>
              </select>
            </label>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Servicio</th>
                <th>Puesto</th>
                <th>Última renovación</th>
                <th>Próxima renovación</th>
                <th>Semáforo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredCollaborators.map((employee) => (
                <tr key={employee.employeeId}>
                  <td>{employee.employeeCode}</td>
                  <td>{employee.fullName}</td>
                  <td>{employee.service || "-"}</td>
                  <td>{employee.position || "-"}</td>
                  <td>{employee.lastRenewalDate || "-"}</td>
                  <td>{getNextRenewal(employee.lastRenewalDate || employee.hireDate)}</td>
                  <td>
                    {(() => {
                      const status = getRenewalStatus(employee.lastRenewalDate || employee.hireDate);
                      return <span className={`renewal-pill ${status.kind}`}>{status.label}</span>;
                    })()}
                  </td>
                  <td>
                    <button type="button" onClick={() => onLoadCollaborator(employee.employeeId)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected ? (
            <>
              <h4>Tallas guardadas</h4>
              <p>Camisa: {selected.shirtSize} | Pantalon: {selected.pantsSize} | Zapato: {selected.shoeSize}</p>
              <p className="muted">2do uniforme: {getSecondUniformDate(selected.hireDate)}</p>
              <p className="muted">Ultima renovacion: {selected.lastRenewalDate || "N/A"}</p>
              <p className="muted">Renovacion: {getNextRenewal(selected.lastRenewalDate || selected.hireDate)}</p>
            </>
          ) : null}
        </article>

        <article id="colaboradores-historial" className="card">
          <h3>Historial de salidas y cambios</h3>
          {!selectedEmployeeId ? <p className="muted">Selecciona un colaborador para ver historial.</p> : null}
          {selectedEmployeeId && selectedHistory.length === 0 ? (
            <p className="muted">Sin movimientos registrados.</p>
          ) : null}
          <ul>
            {selectedHistory.map((event) => (
              <li key={event.id}>
                {new Date(event.createdAt).toLocaleString()} | {event.type.toUpperCase()} | {event.itemLabel} |
                Cant: {event.quantity} | Talla: {event.size ?? "-"} {event.note ? `| ${event.note}` : ""}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h3>Colaboradores pendientes de ID</h3>
          <p className="muted">
            Registros con ID temporal (PTE-*): {pendingIdCollaborators.length}
          </p>
          <div className="row">
            <button type="button" onClick={exportPendingCsv} disabled={pendingIdCollaborators.length === 0}>
              Exportar pendientes CSV
            </button>
          </div>
          {pendingIdCollaborators.length === 0 ? (
            <p className="muted">No hay colaboradores pendientes.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID temporal</th>
                  <th>Nombre</th>
                  <th>Servicio</th>
                  <th>Puesto</th>
                  <th>Nuevo ID</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {pendingIdCollaborators.map((item) => (
                  <tr key={item.employeeId}>
                    <td>{item.employeeCode}</td>
                    <td>{item.fullName}</td>
                    <td>{item.service || "-"}</td>
                    <td>{item.position || "-"}</td>
                    <td>
                      <input
                        value={pendingCodeEdits[item.employeeId] ?? ""}
                        onChange={(e) =>
                          setPendingCodeEdits((current) => ({
                            ...current,
                            [item.employeeId]: e.target.value,
                          }))
                        }
                        placeholder="ID definitivo"
                        disabled={!isAdmin}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void savePendingEmployeeCode(item.employeeId)}
                        disabled={!isAdmin}
                      >
                        Guardar ID
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        </div>
      </div>
    </section>
  );
}
