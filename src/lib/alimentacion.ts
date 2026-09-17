export interface RepartoLote {
  loteId: number
  loteNombre: string
  idCliente: string | null
  clienteNombre: string | null
  /** Animales vivos del lote EN el corral común. */
  nAnimales: number
  cantidadKg: number
  /** Animales vivos del lote en ENFERMERÍA (estimación extra). */
  nAnimalesEnfermeria: number
  cantidadEnfermeriaKg: number
}

export interface AlimentacionView {
  id: number
  fecha: string
  /** Total (corral + enfermería). */
  cantidadKg: number
  /** Lo ingresado para el corral. */
  cantidadCorralKg: number
  /** Estimación para enfermería. */
  cantidadEnfermeriaKg: number
  cantidadPorAnimal: number
  /** Animales vivos en el corral común. */
  nAnimales: number
  nAnimalesEnfermeria: number
  corral: { id: number; nombre: string }
  dieta: { id: number; nombre: string; version: number }
  empresa: { id: number; nombre: string } | null
  lotes: RepartoLote[]
}

export interface CorralOpcion {
  id: number
  nombre: string
  tipo: string
  activo: boolean
  /** ¿Tiene al menos un animal vivo (sano/enfermo)? */
  tieneVivos?: boolean
}

export interface DietaOpcion {
  id: number
  nombre: string
  version: number
  global: boolean
}
