import type { Animal } from '../pages/LoteDetalle'

/** Un pesaje serializado por el server (ver LotesService.pesajeJson). */
export interface PesajeDto {
  id: number
  animalId: number
  /** 'YYYY-MM-DD' */
  fecha: string
  tipo: 'inicial' | 'intermedio' | 'final'
  peso: number
  desbaste: number
  pesoNeto: number | null
}

/** Payload para cargar peso inicial / intermedio (ver CargarPesajesDto). */
export interface CargarPesajesPayload {
  fecha: string
  modo: 'total' | 'animal'
  pesoTotal?: number
  desbasteTotal?: number
  animales?: { animalId: number; peso: number; desbaste?: number }[]
}

export const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const diffDias = (a: string, b: string): number => {
  const da = parseIso(a)
  const db = parseIso(b)
  return Math.round(
    (db.getTime() - da.getTime()) / 86400000,
  )
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export const fmtPeso = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** 'YYYY-MM-DD' → 'DD/MM'. */
export const fmtFechaCorta = (iso: string): string => {
  const parts = iso.slice(0, 10).split('-')
  return `${parts[2]}/${parts[1]}`
}

/** Fecha base del lote: la del pesaje 'inicial' (mín), si no la más antigua. */
export const fechaBase = (pesajes: PesajeDto[]): string | null => {
  const iniciales = pesajes
    .filter((p) => p.tipo === 'inicial')
    .map((p) => p.fecha)
  if (iniciales.length) return iniciales.sort()[0]
  const todas = pesajes.map((p) => p.fecha).sort()
  return todas.length ? todas[0] : null
}

/** Fechas (asc) de los pesajes intermedios del lote. */
export const fechasIntermedias = (pesajes: PesajeDto[]): string[] => {
  const set = new Set<string>()
  for (const p of pesajes) if (p.tipo === 'intermedio') set.add(p.fecha)
  return Array.from(set).sort()
}

/** Suma de peso_inicial de los animales (peso inicial total del lote). */
export const pesoInicialTotal = (animales: Animal[]): number =>
  animales.reduce((acc, a) => acc + (a.pesoInicial ?? 0), 0)

/** Suma de peso_inicial por fecha (para el total del lote en cada pesaje). */
export const totalPorFecha = (pesajes: PesajeDto[], fecha: string): number =>
  pesajes
    .filter((p) => p.fecha === fecha)
    .reduce((acc, p) => acc + Number(p.peso), 0)
