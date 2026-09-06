# AGENTS.md — Gabino Gestión de Hacienda · UI

Guía para agentes y desarrolladores que trabajan en el frontend (repositorio separado).

## Stack

React + Vite + TypeScript + Tailwind CSS v4. Desktop-first, responsive. Package manager: **pnpm**.

## Comandos

```bash
pnpm install   # instalar dependencias
pnpm run dev   # desarrollo → puerto vite
pnpm build     # tsc -b && vite build
pnpm run lint  # eslint
```

El lint del UI usa `eslint.config.js` (sin autofix en el script). No `any` nuevos:
`@typescript-eslint/no-explicit-any` activo. Preferir tipos explícitos (incluidos los `catch`).

## Reglas de oro

1. **Signup crea el doc desde el BE**: al registrarse, `asegurarUsuarioFirestore`
   (`src/lib/signup.ts`) llama a `POST /usuarios/bootstrap`; el backend crea `usuarios/{uid}`
   con el Admin SDK (sin `idRol`, pendiente de sys-admin). El FE nunca escribe directo a Firestore.
2. **Empresa actual**: `AuthContext` sincroniza `currentEmpresaId` (localStorage) con las
   `idEmpresas` del usuario. sys-admin no tiene "empresa actual"; usa `adminEmpresaId`
   (localStorage) en MiEmpresa/Clientes. El interceptor de `api.ts` manda el header
   `x-empresa-id` desde `adminEmpresaId` (si existe) o `currentEmpresaId`. `adminEmpresaId`
   se limpia al cerrar sesión.
3. **SWR**: listas pesadas con `revalidateOnFocus: false`. Refetchear con `mutate()` tras
   crear/editar/vincular. Tras `POST /empresas`: `refetchUser()` (del AuthContext) +
   `mutate('/empresas')` + `mutate('/empresas/me', empresaCreada, { revalidate: false })`
   (sembrar la cache con la empresa que devuelve el POST para pasar de "crear" a "editar"
   sin depender del timing del refetch).
4. **Formulario remontable**: los formularios sincronizados con un recurso cargado usan
   `key={...}` para remontar el componente (evitar setState-en-effect/anti-patterns).
5. **Tema**: paleta marrón en `src/index.css` (tokens oklch). No hardcodear colores fuera de
   los tokens `--color-*`.
6. **Corrales / ubicación de animales**: el estado del corral común (libre/ocupado) y la
   ubicación del animal son DERIVADAS por el server (`lote.id_corral` + excepción
   `animal.id_corral_enfermeria`). En la UI nunca se cachea "dónde está un animal": se lee
   `/corrales/mapa`. **Enfermería con modales**: enviar (desde el mapa o el botón) abre
   `EnviarEnfermeriaModal` → razón/enfermedad obligatoria (catálogo `motivo`) y picker si hay
   varias enfermerías; traer abre `TraerEnfermeriaModal` → estado 'sano'|'muerto' (+ causa si
   es muerto). Pasar estado a enfermo/muerto desde la grilla abre `CambioEstadoModal`
   (`AnimalModals.tsx`). El server registra todo en `animal_movimiento`; el historial se ve
   en `MovimientosModal` (click en la ficha del mapa o botón de reloj junto al estado).
7. **Catálogos** (`CatalogoSelect.tsx`): raza/categoría/proveedor/lugar_origen/motivo como
   autocomplete con alta inline (`/catalogos/:tipo` lee globales+empresa; POST asocia a la
   empresa con `escritura:lote`). `SelectAutocomplete` soporta `allowCreate` + `onCreate`
   (muestra "Agregar …" cuando lo buscado no coincide en lowercase). Vistas sys-admin de
   Razas/Categorías: `pages/CatalogoAdmin.tsx` (submenú "Animales" en el Sidebar).

## Componentes y patrones

- **SelectAutocomplete** (`src/components/SelectAutocomplete.tsx`): select con buscador,
  dropdown en portal. Props: `sort`, `autoSelectSingle`, `defaultFirst`, `clearable`,
  `renderTag`, `allowCreate` + `onCreate` (botón "Agregar …" si lo buscado no coincide en
  lowercase; `onCreate` devuelve el `value` del nuevo item y lo selecciona).
- **CatalogoSelect** (`src/components/CatalogoSelect.tsx`): SelectAutocomplete conectado a
  `/catalogos/:tipo` (globales + mi empresa, alta inline asociada a la empresa).
- **AnimalModals** (`src/components/AnimalModals.tsx`): `EnviarEnfermeriaModal` (motivo +
  picker de enfermerías), `TraerEnfermeriaModal` (estado de salida + causa), `CambioEstadoModal`
  (causa al pasar a enfermo/muerto) y `MovimientosModal` (historial del animal, fecha DESC).
- **Table** (`src/components/Table.tsx`): tabla genérica con Tailwind (tokens actuales).
- **CorralMapa** (`src/components/CorralMapa.tsx`): panel de corrales de `/lotes` (ficha por
  animal con color del lote + N°; anillo rojo = enfermo, atenuado = muerto; **click abre el
  historial de movimientos** del animal). Sólo con `lectura:corral` (el cliente no lo ve). Con
  `escritura:lote` habilita **drag & drop** (HTML5 nativo, sin librerías): común→enfermería
  abre `EnviarEnfermeriaModal` (motivo obligatorio, el destino es la enfermería del drop),
  enfermería→común del lote abre `TraerEnfermeriaModal` (estado de salida), enfermería→otra
  enfermería reasigna (con `EnviarEnfermeriaModal`). Destinos inválidos no aceptan el drop (el
  animal viaja con su lote). Los muertos no se arrastran. El movimiento se persiste tras
  confirmar el modal (ya no es optimista: el modal pide datos obligatorios); en éxito se
  revalidan `/corrales/mapa` y el lote.
- **CowIcon** (`src/components/CowIcon.tsx`): icono de vaca placeholder (la versión de
  lucide-react instalada no exporta "Cow"). Reemplazar por la marca final cuando exista.
- **Contextos**: `AuthContext` (`src/contexts/AuthContext.tsx`) + `ThemeContext`. Los tipos
  viven en `*-context.ts` separados.

## Rutas principales

`/` (Dashboard) · `/login` · `/mi-empresa` (anfitrión/sys-admin) · `/clientes` (anfitrión/sys-admin,
clientes + operarios con tabs) · `/lotes` (listado + mapa de corrales a la derecha) ·
`/lotes/nueva|:id` (detalle: corral/color/proveedor/lugar de origen + titular (cliente o
anfitrión) + tabla de animales con raza/categoría, toggle de estado Sano/Enfermo/Muerto, enfermería
y botón de historial de movimientos; el cliente lo ve en modo SÓLO LECTURA) ·
`/corrales` (alta/edición/deshabilitar; con `lectura:corral`, **oculta al cliente** vía
`ocultarParaCliente` en el Sidebar) · `/animales/razas` y `/animales/categorias` (sys-admin,
submenú "Animales" en el Sidebar) · `/usuarios` (sys-admin, asignar roles) ·
`/configuracion` (sys-admin, limpiar caché)

**Cliente**: tiene `lectura:corral` sólo para el **mapa de Lotes** (`/corrales/mapa`), que el
server filtra a sus lotes/enfermería con animales de sus lotes. No ve la vista Corrales ni
puede escribir (la UI oculta drag y acciones; los endpoints devuelven 403).

**Signup sin rol**: un usuario se registra sin rol (pendiente). El Dashboard le muestra la
cuenta pendiente; sys-admin le asigna rol desde `/usuarios` (`PATCH /usuarios/:uid/rol`) o el
anfitrión lo vincula como cliente/operario desde `/clientes`.

Modelo de datos, paleta y seed de Firestore: ver [`DESIGN.md`](./DESIGN.md).