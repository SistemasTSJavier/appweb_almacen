# APP ALMACEN - React + Supabase

Aplicacion web para administrar operacion de almacen tactico end-to-end:
- inventario por sitio (`CEDIS`, `ACUNA`, `NLD`)
- entradas, salidas, recuperaciones y cambios por dano
- colaboradores y pendientes
- pedidos con PDF
- inventario ciclico e historial
- dashboard operativo

## Stack
- React + TypeScript + Vite
- Supabase (PostgreSQL + Auth + Realtime + RLS)
- TanStack Query + Zustand

## Inicio rapido
1. Copia variables de entorno:
   - `cp .env.example .env` (ajusta `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`)
2. Instala dependencias:
   - `npm install`
3. Levanta el proyecto:
   - `npm run dev`

## SQL y seguridad
- Migraciones en `supabase/migrations`
- Incluye tablas de dominio y politicas RLS por rol/sitio

## Nota
- Si no existen variables Supabase, la app usa datos mock para facilitar desarrollo local.
"# appweb_almacen" 
"# appweb_almacen" 
"# appweb_almacen" 
