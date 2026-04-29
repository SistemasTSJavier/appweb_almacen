# Configuracion completa de Supabase para APPWEB ALMACEN

Esta guia asume que ya creaste el proyecto en Supabase.

## 1) Obtener credenciales del proyecto

En Supabase Dashboard:
- `Project Settings` -> `API`
- Copia:
  - `Project URL`
  - `anon public key`

Crear archivo `.env` en la raiz del proyecto (`APPWEB ALMACEN`) con:

```env
VITE_SUPABASE_URL=TU_PROJECT_URL
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

## 2) Ejecutar migraciones SQL

En Supabase -> `SQL Editor`, ejecutar en este orden:

1. `supabase/migrations/20260428102000_init_app_almacen.sql`
2. `supabase/migrations/20260428143000_inventory_size_recovered_stock.sql`
3. `supabase/migrations/20260428170000_appweb_extended_modules.sql`
4. `supabase/migrations/20260429103000_fix_rls_storage_and_user_claims.sql`
5. `supabase/migrations/20260429105000_sync_collaborator_profiles_with_employees.sql`
6. `supabase/migrations/20260429111500_add_last_renewal_date_to_collaborators.sql`
7. `supabase/migrations/20260429112500_add_position_to_collaborators.sql`

Si usas CLI:

```bash
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

## 3) Crear usuarios de autenticacion (Auth)

En Supabase -> `Authentication` -> `Users` -> `Add user` crear:

- `sistemas@tacticalsupport.com.mx` / `Sistemas2026#`
- `almacencedis@tacticalsupport.com.mx` / `Tactical2026`
- `almacenacuna@tacticalsupport.com.mx` / `Tactical2026`
- `almacennld@tacticalsupport.com.mx` / `Tactical2026`

## 4) Insertar perfiles en tabla `public.users`

Ejecuta este SQL en `SQL Editor` (usa los IDs reales de `auth.users`):

```sql
insert into public.users (id, email, full_name, role, site_code)
select
  id,
  email,
  case
    when email = 'sistemas@tacticalsupport.com.mx' then 'Admin Sistemas'
    when email = 'almacencedis@tacticalsupport.com.mx' then 'Almacen CEDIS'
    when email = 'almacenacuna@tacticalsupport.com.mx' then 'Almacen ACUNA'
    when email = 'almacennld@tacticalsupport.com.mx' then 'Almacen NLD'
    else split_part(email, '@', 1)
  end as full_name,
  case
    when email = 'sistemas@tacticalsupport.com.mx' then 'admin'
    when email = 'almacencedis@tacticalsupport.com.mx' then 'almacen_cedis'
    when email = 'almacenacuna@tacticalsupport.com.mx' then 'almacen_acuna'
    when email = 'almacennld@tacticalsupport.com.mx' then 'almacen_nld'
    else 'operaciones'
  end as role,
  case
    when email in ('sistemas@tacticalsupport.com.mx','almacencedis@tacticalsupport.com.mx') then 'CEDIS'
    when email = 'almacenacuna@tacticalsupport.com.mx' then 'ACUNA'
    when email = 'almacennld@tacticalsupport.com.mx' then 'NLD'
    else 'CEDIS'
  end as site_code
from auth.users
where email in (
  'sistemas@tacticalsupport.com.mx',
  'almacencedis@tacticalsupport.com.mx',
  'almacenacuna@tacticalsupport.com.mx',
  'almacennld@tacticalsupport.com.mx'
)
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  site_code = excluded.site_code;
```

## 5) Storage para evidencias

La migracion ya crea bucket `app-evidence`.
Verifica en `Storage` que exista:
- Bucket: `app-evidence`
- Public: `true`

Si no existe, crear manualmente:
- Name: `app-evidence`
- Public bucket: enabled

## 6) Datos minimos iniciales

Para poder operar:
- Tabla `inventory_items`: al menos 15 articulos por sitio (conteo ciclico usa 15 aleatorios).
- Tabla `employees`: colaboradores base por sitio.

Ejemplo rapido de inventario minimo:

```sql
insert into public.inventory_items (site_code, sku, description, quantity, min_stock)
values
('CEDIS', 'SKU-CEDIS-001', 'Camisa operativa', 25, 10),
('CEDIS', 'SKU-CEDIS-002', 'Pantalon operativo', 22, 10),
('ACUNA', 'SKU-ACUNA-001', 'Camisa operativa', 20, 8),
('NLD', 'SKU-NLD-001', 'Zapato tactico', 18, 8);
```

## 7) Pruebas funcionales recomendadas

1. Login con los 4 usuarios.
2. Verificar que cada almacen solo vea su sitio.
3. Crear salida con evidencia (imagen) y confirmar URL en `dispatches.proof_url`.
4. Crear pedido manual y descargar PDF.
5. Crear tarea de conteo ciclico como admin (max 2 por semana).
6. Revisar trazabilidad en `audit_logs`.

## 8) Si algo falla

- Error de permisos: revisar RLS policies y columna `site_code`.
- Error de login: confirmar usuario en `auth.users` y perfil en `public.users`.
- Error de upload: confirmar bucket `app-evidence` y politica/public.
- Error de datos vacios: cargar inventario y empleados iniciales.

