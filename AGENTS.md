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
7. **Catálogos** (`CatalogoSelect.tsx`): raza/categoria/pelaje/proveedor/lugar_origen/motivo
   como autocomplete con alta inline (`/catalogos/:tipo` lee globales+empresa; POST asocia a la
   empresa con `escritura:lote`). `SelectAutocomplete` soporta `allowCreate` + `onCreate`
   (muestra "Agregar …" cuando lo buscado no coincide en lowercase) + `renderCreateExtra`
   (ej. el select de sexo al crear categorías) y `filter`/`createPayload` en `CatalogoSelect`
   (ej. pelajes de la raza seleccionada). Vistas sys-admin de
   Razas/Categorías: `pages/CatalogoAdmin.tsx` (submenú "Animales" en el Sidebar).
 8. **Animales**: `caravana` requerida (única por lote) y visible en la tabla; `nAnimal` se
    precarga con el último del lote + 1 (editable, `siguienteN` en `LoteDetalle`). El **sexo no
    se edita**: se muestra como label inferido de la categoría (`SexoDeCategoria`). El pelaje es
    catálogo filtrado por la raza (`PelajeSelect` + `lib/catalogos.ts`); raza y categoría usan
    `CategoriaSelect`/`CatalogoSelect` con alta inline. **Cargar animales** (`CargaMasivaModal`):
    es el ÚNICO alta (no hay alta individual; un animal se carga con cantidad=1). Campos
    compartidos + cantidad → preview con caravana por animal
    (`POST /lotes/:id/animales/masiva`). **Sólo la cantidad es requerida**; raza, categoría y
    pelaje son opcionales (se editan después por animal o en masa). Las **caravanas se
    precargan** como `{loteId}-{i}` (1,2,3… n) y son editables (override por animal). No carga
    peso: los pesajes van en la sección de pesajes. Si el lote ya tiene animales con pesaje
    inicial, pide elegir partida (nueva / existente) y, al unir a una partida pesada, exige el
    peso de los animales nuevos.
- **Edición en masa** (`components/EdicionMasivaModal.tsx`): raza/categoría/pelaje para los
  animales del **lote** o de una **partida** (`POST /lotes/:id/animales/edicion-masiva`). Arriba
  el alcance + los campos "aplicar a todos" (setean el valor en todos los del alcance); abajo el
  listado permite **ajustar cada animal** individualmente, con un **X para apartarlo** (no se
  modifica; se listan en "Apartados para después" y se pueden volver a incluir). Campo sin
  cambio no se envía; limpiar una celda borra el valor (null).
 9. **Ancho del layout**: `Layout.tsx` usa `w-[95%] max-w-[1800px]` sobre el área de contenido
    (ya descuenta el sidebar). Las secciones de filtro/alta de las páginas pueden acotarse
    (`max-w-2xl`), pero las tablas ocupan todo el ancho para evitar scroll horizontal.
 10. **Pesajes**: el peso se guarda SIEMPRE por animal (tabla `pesaje`); el total se deriva
    sumando. `EditorPesos` maneja el toggle total/animal (total = reparte `total÷N` y
    previsualiza; animal = inputs por fila y total summarizado, **exige todos**) y acepta
    `salidos` (animales ya egresados listados al final, sólo lectura con su peso registrado;
    fuerza modo por animal). Los editores usan sólo animales VIVOS (sano/enfermo): muertos y
    salidos no se pesan. Fecha por defecto = hoy, editable. **INICIAL por partida** (`GrupoInicial`);
    **INTERMEDIOS del LOTE** (una fila por fecha); **FINAL del lote** con los salidos al final.
    Las columnas intermedias de la tabla de animales son de **lectura**. `EvolucionPesos`
    (recharts) es partida-aware y tiene un **toggle "Incluir entregados"** (por defecto excluye
    salidos; los muertos siempre se excluyen de total/promedio).
11. **Salidas** (`pages/Salidas.tsx`, `components/SalidaModal.tsx`, tipos en `lib/salidas.ts`):
    dar salida a animales vivos por **Lote / Partida / Animales** (checkboxes). Los que no
    tienen pesaje final lo cargan en el modal (obligatorio); al confirmar se registra la salida
    y el animal pasa a estado 'Salido' (badge en la tabla, sin toggle de estado ni enfermería).
    El botón "Dar salida" está en la sección Pesajes del lote (`escritura:salida`); "Salidas del
    lote" navega a `/salidas?lote=`. La vista lista con **filtros encadenados**
    (cliente/corral/lote/partida + rango de fechas), cards mobile + **tabla** desktop, con peso
    inicial → final y la **diferencia del grupo** (+ desglose por animal).
 11. **Partidas**: tanda de ingreso dentro de un lote (`partida` con `fecha`; `animal.id_partida`).
    Nombre "Partida N" derivado. La UI oculta la división si hay una sola. `GET /lotes/:id`
    devuelve `partidas[]` (`id, nombre, fecha, nAnimales, tieneInicial`).

## Componentes y patrones

- **Modales**: todos usan el mismo fondo `fixed inset-0 ... bg-foreground/40` y cierran al
  hacer click afuera del panel (`onMouseDown` en el backdrop con `e.target === e.currentTarget`
  → `onClose`). El panel es hijo directo del backdrop; no mover esa estructura.

- **SelectAutocomplete** (`src/components/SelectAutocomplete.tsx`): select con buscador,
  dropdown en portal. Props: `sort`, `autoSelectSingle`, `defaultFirst`, `clearable`,
  `renderTag`, `allowCreate` + `onCreate` (botón "Agregar …" si lo buscado no coincide en
  lowercase; `onCreate` devuelve el `value` del nuevo item y lo selecciona).
- **CatalogoSelect** (`src/components/CatalogoSelect.tsx`): SelectAutocomplete conectado a
  `/catalogos/:tipo` (globales + mi empresa, alta inline asociada a la empresa). Props:
  `filter` (opciones client-side, ej. pelajes de una raza), `createPayload` (campos extra del
  POST, ej. `sexo`/`idRaza`), `renderCreateExtra` (UI dentro del panel "Agregar"),
  `defaultFirst`. Helpers de animal en `AnimalCatalogos.tsx` (`CategoriaSelect` con select de
  sexo al crear, `PelajeSelect` filtrado por raza, `SexoDeCategoria` label) y
  `lib/catalogos.ts`.
- **AnimalModals** (`src/components/AnimalModals.tsx`): `EnviarEnfermeriaModal` (motivo +
  picker de enfermerías), `TraerEnfermeriaModal` (estado de salida + causa), `CambioEstadoModal`
  (causa al pasar a enfermo/muerto) y `MovimientosModal` (historial del animal, fecha DESC).
- **Table** (`src/components/Table.tsx`): tabla genérica con Tailwind (tokens actuales).
- **CorralMapa** (`src/components/CorralMapa.tsx`): panel de corrales de `/lotes` (ficha por
  animal con color del lote + **número de caravana**; anillo rojo = enfermo, atenuado = muerto;
  **click abre el
  historial de movimientos** del animal). Las fichas salen ordenadas por id de lote y luego por
  caravana (orden natural). Requiere `lectura:lote` (es parte de la vista de Lotes; el cliente
  lo ve, filtrado a sus lotes). Con
  `escritura:lote` habilita **drag & drop** (HTML5 nativo, sin librerías): común→enfermería
  abre `EnviarEnfermeriaModal` (motivo obligatorio, el destino es la enfermería del drop),
  enfermería→común del lote abre `TraerEnfermeriaModal` (estado de salida), enfermería→otra
  enfermería reasigna (con `EnviarEnfermeriaModal`). Destinos inválidos no aceptan el drop (el
  animal viaja con su lote). Los muertos no se arrastran. El movimiento se persiste tras
  confirmar el modal (ya no es optimista: el modal pide datos obligatorios); en éxito se
  revalidan `/corrales/mapa` y el lote. **Layout**: las enfermerías van arriba y los comunes
  abajo; **2 columnas** (xl) por defecto con `escritura:lote`, colapsables a **1 columna** con
  un toggle en el header del mapa (el ancho del panel lo maneja `Lotes.tsx` vía
  `corralesColapsado`). Para lectores (sin interacción) siempre es 1 columna y el panel es más
  angosto, para dar ancho a la lista de lotes. Las cards de corral son **colapsables** (header clickeable, expandidas por
  defecto; durante el drag se fuerzan expandidas). Mientras se arrastra aparece un **dock fijo
  al pie** (portal) con
  los destinos válidos (enfermerías, o el corral del lote al traer), para no depender del
  scroll cuando hay muchos corrales. Un común puede compartir **varios lotes**: el `/corrales/mapa`
  expone `loteIds[]` y "traer" es válido al soltar en un común cuyo `loteIds` incluya el lote
  del animal (las fichas de varios lotes conviven en la misma tarjeta, cada una con su color).
- **Dietas** (`pages/Dietas.tsx`, `components/DietaFormModal.tsx`,
  `components/CalculadoraDietas.tsx`, tipos en `lib/dietas.ts`): módulo de alimentación.
  Izquierda lista de dietas (el lector ve activas; con `escritura:dieta` todas + toggle
  activar/desactivar + "Nueva versión" + "Historial"); derecha calculadora (dieta + kg a
  preparar, default 2500 → kg por ingrediente). El modal de alta usa `CatalogoSelect
  tipo="ingrediente"` por fila + % (suma debe dar 100, el nuevo ingrediente trae el
  restante). Una dieta no se edita: se versiona (`POST /dietas`). **Alcance**: el sys-admin
  elige Global o una empresa (`idEmpresa` null/número) y ve badge "Global"; una dieta global
  sólo la gestiona el admin (`puedeGestionar`) y sus ingredientes deben ser globales.
- **Alimentación** (`pages/Alimentacion.tsx`, `components/AlimentarModal.tsx`, tipos en
  `lib/alimentacion.ts`): el modal de carga tiene el corral fijo arriba y permite **varias
  filas** (dieta + fecha + cantidad por fila; botón "+ Agregar fila", la fila nueva hereda
  fecha y dieta de la anterior). Envía `POST /alimentaciones/masiva` (la cantidad es la del
  CORRAL; los animales del lote en enfermería reciben una estimación extra a la misma tasa —
  ver DESIGN del server). El
  histórico muestra el desglose corral/enfermería (kg y nº de animales) por evento y por lote.
  El botón "Alimentar" está en `/lotes` (junto a "Nuevo lote", sin corral) y en cada card de
  `CorralMapa` (corral preseleccionado, `onAlimentar(corralId)`). La vista `/alimentacion`
  lista con **filtros encadenados** (cliente/corral/lote se filtran entre sí sin el rango de
  fechas) y recibe `?lote=` para preseleccionar el lote desde `/lotes/:id`. En mobile se ven
  **cards** y en desktop una **tabla**.
- **CowIcon** (`src/components/CowIcon.tsx`): icono de vaca placeholder (la versión de
  lucide-react instalada no exporta "Cow"). Reemplazar por la marca final cuando exista.
- **Pesajes** (`lib/pesos.ts` + componentes): la fuente de verdad del peso es `pesaje` (por
  animal). `EditorPesos` (`components/EditorPesos.tsx`) es el editor reutilizable con toggle
  **Peso total de lote / Peso por animal** (total → reparte y previsualiza por animal
  read-only; animal → inputs por fila y total summarizado read-only, **exige todos**). El
  **pesaje inicial** se edita con `GrupoInicial` (`components/GrupoInicial.tsx`): un grupo por
  partida si hay varias (sub-contenedores, envía `idPartida`) o uno solo si el lote tiene una
  (sin división). Los **intermedios** son del lote: `PesajeIntermedioModal` (agregar) y
  **una fila por intermedio** en el contenedor de pesos (fecha, "a X días", total kg) con botón
  "Editar" (inline, `modoDefault="animal"`) y papelera para borrar la columna completa; si cambia
  la fecha se borra la anterior y se crea la nueva. En la tabla de animales las columnas
  intermedias ("Peso · DD/MM · Xd") son de **lectura**. `EvolucionPesos`
  (`components/EvolucionPesos.tsx`, recharts) es partida-aware: total (1 línea de lote o 1 por
  partida), promedio (lote siempre + por partida si hay varias) e individuales.
- **Contextos**: `AuthContext` (`src/contexts/AuthContext.tsx`) + `ThemeContext`. Los tipos
  viven en `*-context.ts` separados.

## Rutas principales

`/` (Dashboard) · `/login` · `/mi-empresa` (anfitrión/sys-admin) · `/clientes` (anfitrión/sys-admin,
clientes + operarios con tabs) · `/lotes` (listado + mapa de corrales a la derecha; la
**columna Empresa** sólo aparece para el cliente —puede tener lotes de varias empresas—, que
además ve "Mis lotes", sin columna Cliente y con el panel de corrales más angosto) ·
`/lotes/nueva|:id` (detalle: corral/color/proveedor/lugar de origen + titular (cliente o
anfitrión) + tabla de animales con raza/categoría, toggle de estado Sano/Enfermo/Muerto, enfermería
y botón de historial de movimientos; el cliente lo ve en modo SÓLO LECTURA) ·
`/corrales` (alta/edición/deshabilitar; con `lectura:corral`, **oculta al cliente** vía
`ocultarParaCliente` en el Sidebar) · `/animales/razas` y `/animales/categorias` (sys-admin,
submenú "Animales" en el Sidebar) · `/dietas` (módulo de alimentación: lista de dietas +
calculadora de raciones; `lectura:dieta` ve activas, `escritura:dieta` versiona y
activa/desactiva) · `/alimentacion` (histórico de alimentaciones con filtros encadenados por
cliente/corral/lote/rango de fechas; `lectura:alimento` ve, `escritura:alimento` registra
desde `/lotes` o el mapa de corrales) · `/salidas` (histórico de salidas con filtros por
cliente/corral/lote/partida/fechas y la diferencia de peso del grupo; `lectura:salida` ve,
`escritura:salida` registra desde la sección Pesajes del lote) · `/usuarios` (sys-admin, asignar roles) ·
`/configuracion` (sys-admin, limpiar caché)

**Cliente**: el **mapa de Lotes** (`/corrales/mapa`) usa `lectura:lote` y el server lo filtra a
sus lotes y a los corrales comunes con animales de sus lotes (enfermería se muestra siempre). En el **Dashboard** sólo ve la tarjeta **Lotes**; en `/lotes` no ve "Nuevo
lote" y el botón de la tabla dice **"Ver"** (los no-escritores no ven "Ver / Editar"). No ve la
vista Corrales ni puede escribir (la UI oculta drag y acciones; los endpoints devuelven 403).

**Signup sin rol**: un usuario se registra sin rol (pendiente). El Dashboard le muestra la
cuenta pendiente; sys-admin le asigna rol desde `/usuarios` (`PATCH /usuarios/:uid/rol`) o el
anfitrión lo vincula como cliente/operario desde `/clientes`.

Modelo de datos, paleta y seed de Firestore: ver [`DESIGN.md`](./DESIGN.md).