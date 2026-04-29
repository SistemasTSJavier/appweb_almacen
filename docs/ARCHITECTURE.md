# Arquitectura APP ALMACEN

## Capas
- `src/shared`: router, guards, layout, query client.
- `src/state`: estado global de sesion y control de acceso.
- `src/services`: auth, dominio, PDF y realtime.
- `src/modules`: vistas funcionales por modulo.
- `supabase/migrations`: modelo SQL + RLS.

## Seguridad
- Control de rutas por sesion (`RequireSession`).
- Restriccion por rol para modulo de pedidos (`RequireRole`).
- RLS por `site_code` y `role` en tablas operativas.

## Realtime
- Suscripcion a cambios de `inventory_items` para refresco automatico.

## Evolucion recomendada
- Separar `domain-service` en servicios por modulo.
- Agregar `supabase/functions` para reglas server-side sensibles.
- Implementar pruebas E2E para flujos criticos.
