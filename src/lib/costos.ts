export interface CostoView {
  id: number
  nombre: string
  descripcion: string | null
  /** NUMERIC de pg llega como string. */
  precioReferencia: number | string | null
  idEmpresa: number | null
  activo: boolean
  createdAt: string
}

export const fmtPrecio = (p: number | string | null | undefined): string => {
  if (p == null || p === '' || isNaN(Number(p))) return '—'
  return Number(p).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
