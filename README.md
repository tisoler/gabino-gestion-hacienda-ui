# Gabino Gestión de Hacienda UI

Frontend **React + Vite + TypeScript + Tailwind CSS v4**, desktop-first y responsive.

## Comandos

```bash
pnpm install   # instalar dependencias
pnpm run dev   # desarrollo → puerto vite (con proxy a la API)
pnpm build     # tsc -b && vite build
pnpm run lint  # eslint
```

## Variables de entorno (`.env`)

- `VITE_API_URL` — URL del backend (ej. `http://localhost:3055/api`).
- `VITE_FIREBASE_*` — configuración de Firebase (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId).

## Convenciones clave

- **Data fetching**: SWR + instancia axios `api` (`src/lib/api.ts`) que agrega el token de Firebase
  y el header `x-empresa-id`. En las listas pesadas se usa `revalidateOnFocus: false`.
- **Empresa actual**: el anfitrión/operario/cliente usa `currentEmpresaId` (localStorage);
  sys-admin puede elegir una empresa puntual con `adminEmpresaId` (p.ej. para Clientes).
- **Tema**: paleta **marrón** (las vacas) con tokens oklch en `src/index.css`; light/dark/system.
- **Componentes reutilizables** (`src/components/`):
  - `SelectAutocomplete` — select con buscador; dropdown en portal.
  - `Table` — tabla genérica estilizada.
  - `CowIcon` — icono de vaca placeholder (marca; lo reemplaza el diseño final).
- **Roles**: `sys-admin`, `anfitrion`, `operario`, `cliente` (labels en `src/constantes/index.ts`).