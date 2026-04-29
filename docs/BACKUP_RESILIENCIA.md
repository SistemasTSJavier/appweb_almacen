# Estrategia de respaldo y resiliencia

## Objetivo
Proteger datos criticos de APPWEB ALMACEN: inventario, movimientos, pedidos, conteos ciclicos y auditoria.

## Respaldo recomendado (Supabase)
- **Base de datos**: backup diario completo + backup incremental cada 6 horas.
- **Storage de evidencias**: versionado del bucket `app-evidence` y replicacion diaria.
- **Retencion**:
  - Operativo: 30 dias
  - Historico: 12 meses

## Plan de recuperacion
- **RTO** (tiempo maximo de recuperacion): 2 horas.
- **RPO** (perdida maxima de datos): 6 horas.
- Restauracion por ambiente:
  1. Restaurar backup DB mas reciente
  2. Restaurar bucket de evidencias
  3. Validar tablas criticas: `inventory_items`, `dispatches`, `recoveries`, `changes`, `purchase_orders`, `audit_logs`
  4. Validar login y flujo minimo end-to-end

## Controles operativos
- Revisar diariamente tareas fallidas de backup.
- Prueba de restauracion mensual en entorno de staging.
- Alertas automáticas por:
  - fallo de backup,
  - crecimiento anormal de errores de escritura,
  - uso de storage > 80%.

## Politica de continuidad
- Toda operacion critica debe generar registro en `audit_logs`.
- Evidencia de imagen se guarda en Supabase Storage y referencia URL en movimiento asociado.
- Ningun cambio productivo sin migracion versionada y rollback plan.
