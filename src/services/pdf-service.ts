import jsPDF from "jspdf";
import type { Order } from "../types/models";
import type { PurchaseOrderDraft } from "./purchase-order-service";
import type { SiteCode } from "../types/models";

export function generateOrderPdf(order: Order): void {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("APP ALMACEN - Pedido", 20, 20);
  doc.setFontSize(11);
  doc.text(`Numero: ${order.orderNumber}`, 20, 35);
  doc.text(`Sitio: ${order.siteCode}`, 20, 45);
  doc.text(`Solicitante: ${order.requestedBy}`, 20, 55);
  doc.text(`Estatus: ${order.status}`, 20, 65);
  doc.text(`Fecha: ${new Date(order.createdAt).toLocaleString()}`, 20, 75);
  doc.save(`${order.orderNumber}.pdf`);
}

export function generatePurchaseOrderPdf(order: PurchaseOrderDraft): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Pedido de Material para Autorizacion", 15, 18);

  doc.setFontSize(11);
  doc.text(`Folio: ${order.orderNumber}`, 15, 28);
  doc.text(`Sitio: ${order.siteCode}`, 15, 35);
  doc.text(`Solicitante: ${order.requestedBy}`, 15, 42);
  doc.text(`Fecha: ${new Date(order.createdAt).toLocaleString()}`, 15, 49);
  doc.text(`Asunto: ${order.title}`, 15, 56);

  let y = 66;
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255, 255, 255);
  doc.rect(15, y, 180, 8, "F");
  doc.text("SKU", 18, y + 5.5);
  doc.text("Descripcion", 45, y + 5.5);
  doc.text("Cantidad", 135, y + 5.5);
  doc.text("Motivo", 160, y + 5.5);
  doc.setTextColor(0, 0, 0);

  y += 10;
  order.items.forEach((item, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(15, y - 4, 180, 8, "F");
    }
    doc.text(item.sku, 18, y);
    doc.text(item.description.slice(0, 40), 45, y);
    doc.text(String(item.quantity), 138, y);
    doc.text(item.reason.slice(0, 20), 160, y);
    y += 8;
  });

  y += 10;
  doc.text("Autorizacion:", 15, y);
  doc.line(45, y, 120, y);
  doc.text("Vo.Bo. Compras:", 130, y);
  doc.line(165, y, 195, y);

  doc.save(`${order.orderNumber}.pdf`);
}

interface DashboardReportInput {
  generatedAt: string;
  kpis: {
    skus: number;
    units: number;
    critical: number;
    weeklyDispatches: number;
    weeklyRecoveries: number;
    orders: number;
  };
  healthBySite: Array<{ site: SiteCode; total: number; critical: number; compliance: number }>;
  alerts: string[];
}

export function generateDashboardReportPdf(input: DashboardReportInput): void {
  const doc = new jsPDF();
  doc.setFontSize(17);
  doc.text("TACTICAL SUPPORT - REPORTE EJECUTIVO", 14, 18);
  doc.setFontSize(10);
  doc.text(`Fecha de emision: ${new Date(input.generatedAt).toLocaleString()}`, 14, 25);

  doc.setFontSize(12);
  doc.text("KPIs", 14, 35);
  doc.setFontSize(10);
  doc.text(`SKUs activos: ${input.kpis.skus}`, 14, 42);
  doc.text(`Unidades totales: ${input.kpis.units}`, 14, 48);
  doc.text(`Stock critico: ${input.kpis.critical}`, 14, 54);
  doc.text(`Salidas semana: ${input.kpis.weeklyDispatches}`, 90, 42);
  doc.text(`Recuperaciones semana: ${input.kpis.weeklyRecoveries}`, 90, 48);
  doc.text(`Pedidos registrados: ${input.kpis.orders}`, 90, 54);

  let y = 65;
  doc.setFontSize(12);
  doc.text("Salud por almacen", 14, y);
  y += 6;
  doc.setFillColor(15, 23, 42);
  doc.setTextColor(255, 255, 255);
  doc.rect(14, y, 182, 8, "F");
  doc.text("Sitio", 18, y + 5.5);
  doc.text("SKUs", 55, y + 5.5);
  doc.text("Criticos", 95, y + 5.5);
  doc.text("Cumplimiento", 135, y + 5.5);
  doc.setTextColor(0, 0, 0);
  y += 12;
  input.healthBySite.forEach((row) => {
    doc.text(row.site, 18, y);
    doc.text(String(row.total), 58, y);
    doc.text(String(row.critical), 98, y);
    doc.text(`${row.compliance}%`, 138, y);
    y += 7;
  });

  y += 8;
  doc.setFontSize(12);
  doc.text("Alertas clave", 14, y);
  y += 6;
  doc.setFontSize(10);
  if (input.alerts.length === 0) {
    doc.text("Sin alertas activas", 14, y);
  } else {
    input.alerts.slice(0, 8).forEach((alert) => {
      doc.text(`- ${alert.slice(0, 90)}`, 14, y);
      y += 6;
    });
  }

  y += 10;
  doc.text("Firma responsable:", 14, y);
  doc.line(48, y, 120, y);
  doc.text("Vo.Bo. Direccion:", 132, y);
  doc.line(166, y, 196, y);

  doc.save(`dashboard-ejecutivo-${new Date().toISOString().slice(0, 10)}.pdf`);
}
