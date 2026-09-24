import { useEffect, useMemo, useRef, useState } from 'react'
import { round2 } from '../lib/pesos'

export interface FilaSeleccionPesos {
  id: number
  nAnimal: number | null
  caravana: string | null
  tieneFinal: boolean
  pesoFinal?: number | null
}

export interface DatosSeleccionPesos {
  seleccion: number[]
  /** Pesos (kg) de los seleccionados SIN final (los editables). */
  pesos: Record<number, number>
  /** Desbastes (kg) de los seleccionados SIN final. */
  desbastes: Record<number, number>
}

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

const labelAnimal = (a: FilaSeleccionPesos) =>
  a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`

/**
 * Entrada de pesos unificada para salida y pesaje final, en cualquier alcance:
 *  - inputs de TOTALES arriba (se reparten ÷ los editables: sin peso final);
 *  - una sola tabla abajo (altura de fila constante reservada para los inputs).
 *  Con `seleccionable` (alcance "Animales") cada fila tiene un checkbox y el
 *  total se divide por los seleccionados; sin él (Lote/Partida) entran todos.
 *  Emite los datos vía `onDatos` en cada cambio.
 */
export function SeleccionAnimalesPesos({
  animales,
  titulo,
  seleccionable,
  onDatos,
}: {
  animales: FilaSeleccionPesos[]
  titulo: string
  /** true = alcance "Animales" (checkbox por fila); false = entran todos. */
  seleccionable: boolean
  onDatos: (d: DatosSeleccionPesos) => void
}) {
  const [seleccion, setSeleccion] = useState<Set<number>>(() =>
    seleccionable ? new Set() : new Set(animales.map((a) => a.id)),
  )
  const [pesos, setPesos] = useState<Record<number, string>>({})
  const [desbastes, setDesbastes] = useState<Record<number, string>>({})
  const [pesoTotal, setPesoTotal] = useState('')
  const [desbasteTotal, setDesbasteTotal] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const masterRef = useRef<HTMLInputElement>(null)

  // Visibles (alcance "Animales"): filtrados por el buscador y ordenados por
  // caravana ascendente (orden natural). Lote/Partida mantiene su orden.
  const visibles = useMemo(() => {
    if (!seleccionable) return animales
    const q = busqueda.trim().toLowerCase()
    const filtrados = q
      ? animales.filter(
        (a) =>
          (a.caravana ?? '').toLowerCase().includes(q) ||
          (a.nAnimal != null && String(a.nAnimal).includes(q)),
      )
      : [...animales]
    return filtrados.sort((a, b) => {
      const ca = a.caravana ?? ''
      const cb = b.caravana ?? ''
      if (!ca && cb) return 1
      if (ca && !cb) return -1
      const cmp = ca.localeCompare(cb, 'es', { numeric: true })
      if (cmp !== 0) return cmp
      const na = a.nAnimal ?? Number.MAX_SAFE_INTEGER
      const nb = b.nAnimal ?? Number.MAX_SAFE_INTEGER
      return na - nb || a.id - b.id
    })
  }, [animales, seleccionable, busqueda])

  const nVisiblesElegidos = visibles.filter((a) => seleccion.has(a.id)).length
  const todosElegidos = visibles.length > 0 && nVisiblesElegidos === visibles.length
  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.indeterminate = !todosElegidos && nVisiblesElegidos > 0
    }
  }, [todosElegidos, nVisiblesElegidos])

  // Incluidos = los seleccionados (Animales) o todos (Lote/Partida).
  const incluidos = useMemo(
    () => (seleccionable ? seleccion : new Set(animales.map((a) => a.id))),
    [animales, seleccionable, seleccion],
  )
  // Editables = incluidos SIN final (sobre ellos se divide el total).
  const editables = useMemo(
    () => animales.filter((a) => incluidos.has(a.id) && !a.tieneFinal),
    [animales, incluidos],
  )

  const emitir = (
    sel: Set<number>,
    p: Record<number, string>,
    d: Record<number, string>,
  ) => {
    const pesosNum: Record<number, number> = {}
    const desbNum: Record<number, number> = {}
    for (const a of animales) {
      if (!sel.has(a.id) || a.tieneFinal) continue
      const pn = parseNum(p[a.id] ?? '')
      if (pn != null) pesosNum[a.id] = pn
      const dn = parseNum(d[a.id] ?? '')
      if (dn != null) desbNum[a.id] = dn
    }
    onDatos({ seleccion: Array.from(sel), pesos: pesosNum, desbastes: desbNum })
  }

  const toggle = (id: number) => {
    if (!seleccionable) return
    const next = new Set(seleccion)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSeleccion(next)
    redistribuir(next)
  }
  const toggleTodos = () => {
    const next = new Set(seleccion)
    if (todosElegidos) for (const a of visibles) next.delete(a.id)
    else for (const a of visibles) next.add(a.id)
    setSeleccion(next)
    redistribuir(next)
  }
  // Invierte la selección de los visibles (los filtrados por el buscador).
  const invertirVisibles = () => {
    const next = new Set(seleccion)
    for (const a of visibles) {
      if (next.has(a.id)) next.delete(a.id)
      else next.add(a.id)
    }
    setSeleccion(next)
    redistribuir(next)
  }

  // Al cambiar la selección, si hay totales ingresados se vuelven a dividir
  // por los seleccionados (editables) actuales.
  const redistribuir = (sel: Set<number>) => {
    const ed = animales.filter((a) => sel.has(a.id) && !a.tieneFinal)
    if (ed.length === 0) return
    const tPeso = parseNum(pesoTotal)
    const tDesb = parseNum(desbasteTotal)
    let nextPesos = pesos
    let nextDesb = desbastes
    if (tPeso != null) {
      const per = round2(tPeso / ed.length)
      nextPesos = { ...pesos }
      for (const a of ed) nextPesos[a.id] = String(per)
    }
    if (tDesb != null) {
      const per = round2(tDesb / ed.length)
      nextDesb = { ...desbastes }
      for (const a of ed) nextDesb[a.id] = String(per)
    }
    if (nextPesos !== pesos) setPesos(nextPesos)
    if (nextDesb !== desbastes) setDesbastes(nextDesb)
    emitir(sel, nextPesos, nextDesb)
  }

  const repartir = (campo: 'peso' | 'desbaste', total: number) => {
    if (editables.length === 0) return
    const per = round2(total / editables.length)
    if (campo === 'peso') {
      const next = { ...pesos }
      for (const a of editables) next[a.id] = String(per)
      setPesos(next)
      emitir(incluidos, next, desbastes)
    } else {
      const next = { ...desbastes }
      for (const a of editables) next[a.id] = String(per)
      setDesbastes(next)
      emitir(incluidos, pesos, next)
    }
  }
  const onTotalPeso = (v: string) => {
    setPesoTotal(v)
    const num = parseNum(v)
    if (num != null) repartir('peso', num)
  }
  const onTotalDesbaste = (v: string) => {
    setDesbasteTotal(v)
    const num = parseNum(v)
    if (num != null) repartir('desbaste', num)
  }

  const onFilaPeso = (id: number, v: string) => {
    const next = { ...pesos, [id]: v }
    setPesos(next)
    let suma = 0
    for (const a of editables) suma += parseNum(a.id === id ? v : (pesos[a.id] ?? '')) ?? 0
    setPesoTotal(round2(suma) ? String(round2(suma)) : '')
    emitir(incluidos, next, desbastes)
  }
  const onFilaDesbaste = (id: number, v: string) => {
    const next = { ...desbastes, [id]: v }
    setDesbastes(next)
    let suma = 0
    for (const a of editables) suma += parseNum(a.id === id ? v : (desbastes[a.id] ?? '')) ?? 0
    setDesbasteTotal(round2(suma) ? String(round2(suma)) : '')
    emitir(incluidos, pesos, next)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">
          {titulo} ({seleccionable ? seleccion.size : animales.length} de {animales.length})
        </label>
      </div>

      {/* Totales: siempre visibles */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Peso total (kg)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={pesoTotal}
            onChange={(e) => onTotalPeso(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Ej: 12000"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Desbaste total <span className="text-muted-foreground">(opcional)</span>
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={desbasteTotal}
            onChange={(e) => onTotalDesbaste(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Ej: 200"
          />
        </div>
      </div>
      {seleccionable && (
        <div className="flex items-center gap-3 mt-3">
          <label
            className="flex items-center gap-1.5 text-xs text-foreground shrink-0 cursor-pointer"
            title="Seleccionar todos los visibles"
          >
            <input
              ref={masterRef}
              type="checkbox"
              checked={todosElegidos}
              onChange={toggleTodos}
              className="size-4 accent-primary cursor-pointer"
            />
            Todos
          </label>
          <button
            type="button"
            onClick={invertirVisibles}
            title="Invertir la selección de los visibles"
            className="text-xs text-primary hover:underline shrink-0 cursor-pointer"
          >
            Invertir
          </button>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputCls} flex-1 min-w-0`}
            placeholder="Buscar caravana…"
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {editables.length > 0
          ? `El total se reparte ÷ ${editables.length} (los ${seleccionable ? 'seleccionados' : 'del alcance'
          } sin peso final); si editás un animal, se recalcula el total.`
          : 'Seleccioná animales sin peso final para repartir el total.'}
      </p>

      {/* Tabla única: altura de fila constante (reservada para los inputs) */}
      <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
        {visibles.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {animales.length === 0 ? 'No hay animales.' : 'Sin coincidencias para la búsqueda.'}
          </p>
        )}
        {visibles.map((a) => {
          const elegido = seleccionable ? seleccion.has(a.id) : true
          return (
            <div
              key={a.id}
              className="flex items-center gap-2 px-3 py-2 min-h-[52px]"
            >
              {seleccionable && (
                <input
                  type="checkbox"
                  checked={elegido}
                  onChange={() => toggle(a.id)}
                  className="size-4 accent-primary shrink-0 cursor-pointer"
                />
              )}
              <span
                className="flex-1 min-w-0 text-sm text-foreground truncate"
                title={labelAnimal(a)}
              >
                {labelAnimal(a)}
              </span>
              {elegido && a.tieneFinal && (
                <span className="text-xs text-success shrink-0">
                  Tiene final · {a.pesoFinal ?? '—'} kg
                </span>
              )}
              {elegido && !a.tieneFinal && (
                <>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pesos[a.id] ?? ''}
                    onChange={(e) => onFilaPeso(a.id, e.target.value)}
                    className={`${inputCls} flex-1 min-w-0`}
                    placeholder="Peso final (kg)"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={desbastes[a.id] ?? ''}
                    onChange={(e) => onFilaDesbaste(a.id, e.target.value)}
                    className={`${inputCls} flex-1 min-w-0`}
                    placeholder="Desbaste"
                    title="Desbaste (opcional)"
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}