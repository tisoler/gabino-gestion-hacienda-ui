import type { CorralOpcion } from './alimentacion'

export const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Matchea un número de corral contra los corrales comunes activos. */
export const matchCorral = (
  numero: string | null,
  corralesActivos: CorralOpcion[],
): number | undefined => {
  if (numero == null) return undefined
  const n = Number(numero)
  const porNombre = corralesActivos.find((c) =>
    c.nombre.toLowerCase().includes(numero.toLowerCase()),
  )
  if (porNombre) return porNombre.id
  const porId = corralesActivos.find((c) => c.id === n)
  return porId?.id
}

const normTxt = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Similitud 0..1 (Levenshtein normalizado). */
const similitud = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  if (!m || !n) return 0
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

/**
 * Matchea un texto contra una lista {id, nombre}. Devuelve el id de la mejor
 * coincidencia: gana la regla más específica y, en empate, el nombre más largo
 * si la evidencia es fuerte (frase/todas las palabras) o el más corto si es
 * débil.
 * Reglas: frase exacta en la línea > todas las palabras presentes >
 * token idéntico > contiene/contenido/prefijo/3-letras > fuzzy >= 0.8.
 */
const matchEnLista = (
  texto: string,
  tokens: string[],
  items: { id: number; n: string; orden: number }[],
): number | undefined => {
  type Cand = { id: number; nivel: number; len: number; orden: number }
  const cands: Cand[] = []
  for (const d of items) {
    const palabras = d.n.split(' ').filter((w) => w.length > 0)
    // Frase completa en la línea ("RACIÓN TMR" en "RACION TMR ...").
    if (texto.includes(d.n)) {
      cands.push({ id: d.id, nivel: 0, len: d.n.length, orden: d.orden })
      continue
    }
    // Todas las palabras del nombre presentes como tokens.
    if (palabras.every((w) => tokens.some((t) => t === w))) {
      cands.push({ id: d.id, nivel: 1, len: d.n.length, orden: d.orden })
      continue
    }
    // Token idéntico al nombre.
    if (tokens.some((t) => t === d.n)) {
      cands.push({ id: d.id, nivel: 2, len: d.n.length, orden: d.orden })
      continue
    }
    // Contiene / contenido / prefijo / 3 letras (fragmentos OCR).
    const parcial =
      tokens.some((t) => t.includes(d.n)) ||
      (d.n.length >= 4 && tokens.some((t) => d.n.includes(t))) ||
      (d.n.length >= 4 && tokens.some((t) => t.length >= 4 && d.n.startsWith(t))) ||
      (d.n.length >= 3 && tokens.some((t) => t.length >= 4 && t.slice(0, 3) === d.n.slice(0, 3)))
    if (parcial) {
      cands.push({ id: d.id, nivel: 3, len: d.n.length, orden: d.orden })
      continue
    }
    // Fuzzy por token (errores de 1-2 letras).
    let best = 0
    for (const t of tokens) {
      if (t.length < 4 || /\d/.test(t) || d.n.length < 4) continue
      const s = similitud(t, d.n)
      if (s >= 0.8 && s > best) best = s
    }
    if (best > 0) cands.push({ id: d.id, nivel: 4, len: Math.round(d.n.length * best), orden: d.orden })
  }
  if (cands.length === 0) return undefined
  cands.sort(
    (a, b) => a.nivel - b.nivel || (a.nivel <= 1 ? b.len - a.len : a.len - b.len) || a.orden - b.orden,
  )
  return cands[0].id
}

export type TipoCatalogo = 'dieta' | 'tratamiento' | 'insumo'

export interface CatalogoNombre {
  id: number
  nombre: string
}

/**
 * Busca el texto primero en dietas, luego en tratamientos y luego en insumos.
 * Devuelve el tipo y el id del mejor match, o undefined si no hay.
 */
export const matchCatalogo = (
  linea: string,
  catalogos: { dietas: CatalogoNombre[]; tratamientos: CatalogoNombre[]; insumos: CatalogoNombre[] },
): { tipo: TipoCatalogo; id: number } | undefined => {
  const texto = normTxt(linea)
  const tokens = texto.split(' ').filter((t) => t.length >= 3)
  if (tokens.length === 0) return undefined
  const nom = (arr: CatalogoNombre[]) =>
    arr
      .map((d, i) => ({ id: d.id, n: normTxt(d.nombre), orden: i }))
      .filter((d) => d.n.length > 0)
  const idDieta = matchEnLista(texto, tokens, nom(catalogos.dietas))
  if (idDieta != null) return { tipo: 'dieta', id: idDieta }
  const idTrat = matchEnLista(texto, tokens, nom(catalogos.tratamientos))
  if (idTrat != null) return { tipo: 'tratamiento', id: idTrat }
  const idIns = matchEnLista(texto, tokens, nom(catalogos.insumos))
  if (idIns != null) return { tipo: 'insumo', id: idIns }
  return undefined
}
