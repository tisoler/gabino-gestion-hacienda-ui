export interface SalidaItemView {
  animalId: number
  nAnimal: number | null
  caravana: string | null
  pesoInicial: number | null
  pesoFinal: number
  diferenciaKg: number
}

export interface SalidaView {
  id: number
  fecha: string
  tipo: 'lote' | 'partida' | 'animales'
  nAnimales: number
  pesoInicialTotal: number
  pesoFinalTotal: number
  diferenciaKg: number
  lote: { id: number; nombre: string }
  corral: { id: number; nombre: string } | null
  partida: { id: number; nombre: string; fecha: string } | null
  cliente: { id: string; nombre: string | null } | null
  empresa: { id: number; nombre: string } | null
  animales: SalidaItemView[]
}

export const SALIDA_TIPO_LABELS: Record<string, string> = {
  lote: 'Lote',
  partida: 'Partida',
  animales: 'Animales',
}