export interface TratamientoView {
  id: number
  nombre: string
  descripcion: string | null
  /** NUMERIC de pg llega como string. */
  precioReferencia: number | string | null
  idEmpresa: number | null
  activo: boolean
  createdAt: string
}

/** Item de tratamiento para aplicar (ids existentes o datos para crear). */
export interface TratamientoPayloadInsumo {
  idRegistro?: number
  idInsumo?: number
  nombreInsumo?: string
  descripcion?: string | null
  precioReferencia?: number | null
  unidad?: string | null
  idCategoria?: number | null
  precio: number | null
}

export interface TratamientoPayload {
  idRegistro?: number
  idTratamiento?: number
  nombreTratamiento?: string
  descripcion?: string | null
  precioReferencia?: number | null
  precio: number | null
  insumos: TratamientoPayloadInsumo[]
}

export type HistorialItem =
  | {
      kind: 'movimiento'
      id: number
      tipo: string
      estadoAntes: string | null
      estadoDespues: string | null
      corralOrigen: string | null
      corralDestino: string | null
      motivo: string | null
      idUsuario: string | null
      usuarioNombre: string | null
      fecha: string
      tratamientos: { id: number; nombre: string; precio: number | null }[]
    }
  | {
      kind: 'tratamiento'
      id: number
      tratamiento: { id: number; nombre: string }
      precio: number | null
      alcance: string
      fecha: string
      idUsuario: string | null
      usuarioNombre: string | null
    }

export interface TratamientoAplicadoView {
  id: number
  idAnimal: number
  idMovimiento: number | null
  tratamiento: { id: number; nombre: string }
  precio: number | null
  fecha: string
  hora: string
  alcance: string
  insumos: {
    id: number
    idInsumo: number
    nombre: string
    precio: number | null
  }[]
}

export const fmtPrecio = (p: number | string | null | undefined): string => {
  if (p == null || p === '') return '—'
  const n = Number(p)
  if (isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Saca bloques/insumos vacíos (sin selección). */
export function limpiarTratamientosPayload(items: TratamientoPayload[]): TratamientoPayload[] {
  return items
    .filter((b) => b.idRegistro != null || b.idTratamiento != null || !!b.nombreTratamiento)
    .map((b) => ({
      ...b,
      insumos: b.insumos.filter(
        (i) => i.idRegistro != null || i.idInsumo != null || !!i.nombreInsumo,
      ),
    }))
}

/** Cada bloque conservado necesita al menos un insumo. */
export function validarTratamientosPayload(items: TratamientoPayload[]): string | null {
  for (const b of items) {
    if (!b.insumos.some((i) => i.idInsumo != null || !!i.nombreInsumo)) {
      return 'Cada tratamiento necesita al menos un insumo.'
    }
  }
  return null
}

/** Payload del editor → forma del DTO del server. */
export function aTratamientosDto(items: TratamientoPayload[]) {
  return items.map((b) => ({
    ...(b.idRegistro != null ? { id: b.idRegistro } : {}),
    ...(b.idTratamiento != null ? { idTratamiento: b.idTratamiento } : {}),
    ...(b.nombreTratamiento
      ? {
          nombre: b.nombreTratamiento,
          ...(b.descripcion ? { descripcion: b.descripcion } : {}),
          ...(b.precioReferencia != null ? { precioReferencia: b.precioReferencia } : {}),
        }
      : {}),
    precio: b.precio,
    insumos: b.insumos.map((i) => ({
      ...(i.idRegistro != null ? { id: i.idRegistro } : {}),
      ...(i.idInsumo != null ? { idInsumo: i.idInsumo } : {}),
      ...(i.nombreInsumo
        ? {
            nombre: i.nombreInsumo,
            ...(i.descripcion ? { descripcion: i.descripcion } : {}),
            ...(i.precioReferencia != null ? { precioReferencia: i.precioReferencia } : {}),
            ...(i.unidad ? { unidad: i.unidad } : {}),
            ...(i.idCategoria != null ? { idCategoria: i.idCategoria } : {}),
          }
        : {}),
      precio: i.precio,
    })),
  }))
}
