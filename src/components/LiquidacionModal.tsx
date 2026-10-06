import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface ItemLiquidable {
  key: string
  tipo: 'alimentacion' | 'tratamiento' | 'aplicacion'
  id: number
  fecha: string
  etiqueta: string
  costo: number
}

/**
 * Ingresar una liquidación: date picker arriba (default hoy) + tabla de
 * movimientos pendientes (todo tipo) con checkbox. Preselecciona los de fecha
 * menor o igual a la elegida; se pueden agregar/sacar a mano. Al guardar, cada
 * seleccionado pasa a liquidada.
 */
export function LiquidacionModal({
  loteId,
  onClose,
  onGuardado,
}: {
  loteId: number
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  // Preselección: todo lo pendiente hasta la fecha elegida (al cargar datos
  // o al cambiar la fecha; los toggles manuales no la redisparan).
  const [fecha, setFecha] = useState(hoyIso())
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [prevItems, setPrevItems] = useState<ItemLiquidable[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { data: balance, isLoading, error: errorCarga } = useSWR<{
    alimentaciones: {
      id: number
      fecha: string
      dietaNombre: string
      dietaVersion: number
      costo: number
      liquidada: boolean
    }[]
    tratamientos: {
      kind: 'animal' | 'lote'
      id: number
      fecha: string
      nombres: string[]
      nAnimales?: number
      costo: number
      liquidada: boolean
    }[]
  }>(`/lotes/${loteId}/balance`, fetcher, { revalidateOnFocus: false })

  const items: ItemLiquidable[] = useMemo(() => {
    if (!balance || !('alimentaciones' in balance)) return []
    const lista: ItemLiquidable[] = [
      ...balance.alimentaciones
        .filter((a) => !a.liquidada)
        .map((a): ItemLiquidable => ({
          key: `alimentacion:${a.id}`,
          tipo: 'alimentacion',
          id: a.id,
          fecha: a.fecha,
          etiqueta: `Alimentación · ${a.dietaNombre} (v${a.dietaVersion})`,
          costo: a.costo,
        })),
      ...balance.tratamientos
        .filter((t) => !t.liquidada)
        .map((t): ItemLiquidable => ({
          key: `${t.kind === 'lote' ? 'aplicacion' : 'tratamiento'}:${t.id}`,
          tipo: t.kind === 'lote' ? 'aplicacion' : 'tratamiento',
          id: t.id,
          fecha: t.fecha,
          etiqueta:
            t.kind === 'lote'
              ? `${t.nombres.join(' + ') || 'Tratamiento'} (${t.nAnimales ?? 0} an.)`
              : (t.nombres.join(' + ') || 'Tratamiento'),
          costo: t.costo,
        })),
    ]
    return lista.sort((a, b) =>
      a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id,
    )
  }, [balance])

  // Preselección inicial al cargar datos + al cambiar la fecha (los toggles
  // manuales no la redisparan: sólo cambian cuando cambian los items o fecha).
  if (items !== prevItems) {
    setPrevItems(items)
    setSeleccion(new Set(items.filter((i) => i.fecha <= fecha).map((i) => i.key)))
  }

  const elegirFecha = (v: string) => {
    setFecha(v)
    setSeleccion(new Set(items.filter((i) => i.fecha <= v).map((i) => i.key)))
  }

  const toggle = (key: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const totalSel = useMemo(
    () => items.filter((i) => seleccion.has(i.key)).reduce((acc, i) => acc + i.costo, 0),
    [items, seleccion],
  )

  const submit = async () => {
    if (seleccion.size === 0) {
      setError('Seleccioná al menos un ítem a liquidar.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post(`/lotes/${loteId}/liquidar`, {
        items: items
          .filter((i) => seleccion.has(i.key))
          .map((i) => ({ tipo: i.tipo, id: i.id })),
      })
      await onGuardado()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar la liquidación.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Liquidar movimientos
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Se preseleccionan los pendientes hasta la fecha elegida; después podés
          agregar o sacar con los checks. Al guardar, cada seleccionado pasa a liquidado.
        </p>

        <div className="max-w-[200px] space-y-1.5">
          <label className="text-xs font-medium text-foreground">Liquidar hasta</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => elegirFecha(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>

        {errorCarga ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudo cargar el balance.
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay movimientos pendientes de liquidar.
          </p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
            {items.map((it) => {
              const on = seleccion.has(it.key)
              return (
                <div
                  key={it.key}
                  onClick={() => toggle(it.key)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(it.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-4 accent-primary shrink-0 cursor-pointer"
                  />
                  <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={it.etiqueta}>
                    {it.etiqueta}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtFecha(it.fecha)}</span>
                  <span className="text-sm tabular-nums text-foreground shrink-0">$ {fmtMoney(it.costo)}</span>
                </div>
              )
            })}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-sm text-muted-foreground tabular-nums">
            {seleccion.size} seleccionados · <span className="text-foreground font-semibold">$ {fmtMoney(totalSel)}</span>
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={busy || seleccion.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar liquidación
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
