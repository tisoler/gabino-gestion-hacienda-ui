export interface InsumoView {
  idInsumo: number
  nombre: string
  porcentaje: number
}

export interface DietaView {
  id: number
  nombre: string
  idEmpresa: number | null
  /** true si es una dieta global (visible/usable por todas las empresas). */
  global: boolean
  activa: boolean
  version: number
  actualizadaEn: string | null
  insumos: InsumoView[]
}

/** Kg de un insumo para una cantidad dada de dieta. */
export const kgInsumo = (cantidadKg: number, porcentaje: number): number =>
  Math.round(((cantidadKg * porcentaje) / 100) * 100) / 100

export const fmtKg = (n: number): string =>
  n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
