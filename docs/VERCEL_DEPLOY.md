# Desplegar en Vercel desde GitHub

Esta app es **Vite + React**. En Vercel se usa `vite build` (sin `tsc -b`) para que el despliegue no dependa de errores de tipo pendientes en el repo. Las variables de Supabase deben configurarse en Vercel.

## 1. Repositorio en GitHub

1. Crea un repositorio **privado** en GitHub (recomendado para uso interno).
2. Abre una terminal en la carpeta del proyecto (`APPWEB ALMACEN`).
3. Si **no** hay un repositorio Git solo para esta carpeta, inicialízalo:

   ```bash
   git init
   git branch -M main
   ```

4. Asegúrate de **no** tener `.env` con secretos en el commit (ya está en `.gitignore`).
5. Añade el remoto y sube (sustituye `TU-USUARIO` y `TU-REPO`):

   ```bash
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git add .
   git commit -m "Initial commit: app almacen"
   git push -u origin main
   ```

Si tu carpeta está dentro de otro repo Git más grande, o bien mueve el proyecto a su propia carpeta, o usa un **subfolder** en GitHub Actions; lo más simple es **un repo = esta carpeta**.

## 2. Proyecto en Vercel

1. Entra en [https://vercel.com](https://vercel.com) e inicia sesión.
2. **Add New → Project → Import** tu repositorio de GitHub.
3. Configuración sugerida (Vercel suele detectarla sola gracias a `vercel.json`):
   - **Framework Preset:** Vite
   - **Build Command:** `vite build` (ya definido en `vercel.json`)
   - **Output Directory:** `dist`
4. En **Environment Variables**, añade (Production + Preview si quieres):

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | URL del proyecto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | Clave anónima (anon public) |

   Copia los mismos valores que usas en tu `.env` local. Ver `.env.example`.

5. **Deploy**. Cada `git push` a `main` (o la rama que conectes) volverá a desplegar.

## 3. Supabase (auth y CORS)

1. En Supabase: **Authentication → URL configuration**.
2. Añade la URL de producción de Vercel, por ejemplo:
   - `https://tu-app.vercel.app`
3. Si usas dominio propio, añade también `https://tudominio.com`.

Así el login y las redirecciones no fallan en producción.

## 4. Rutas de la SPA (React Router)

`vercel.json` incluye `rewrites` hacia `index.html` para que rutas como `/inventario` o `/operaciones` funcionen al recargar o al abrir un enlace directo.

## 5. Build local al estilo Vercel

```bash
npm install
npx vite build
npx vite preview
```

Para comprobar el build de producción antes de subir cambios.
