import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import { AtajosHora } from './AtajosHora'
import { NumeroInput } from './NumeroInput'
import { DetallePopover } from './DetallePopover'
import type { CorralOpcion, DietaOpcion, EstadoCorralLote } from '../lib/alimentacion'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

interface Fila {
  key: number
  idDieta: string | number
  fecha: string
  hora: string
  cantidad: string
  /** Conteos reconstruidos (o ajustados) por lote, para enviar como override. */
  ajuste: EstadoCorralLote[] | null
  ajusteCargando: boolean
}

let proxKey = 1
const nuevaFila = (prev?: Fila): Fila => ({
  key: proxKey++,
  idDieta: prev?.idDieta ?? '',
  fecha: prev?.fecha ?? hoyIso(),
  hora: prev?.hora ?? '09:00',
  cantidad: prev?.cantidad ?? '',
  ajuste: null,
  ajusteCargando: false,
})

/** Datos de una alimentación existente para editarla en el mismo modal. */
export interface EdicionAlimentacion {
  id: number
  idCorral: number
  corralNombre: string
  idDieta: number
  cantidadKg: number
  fecha: string
  hora: string
}

/**
 * Alimentar corral: corral fijo arriba + UNA O MÁS filas (dieta + fecha + hora
 * + cantidad). Cada fila muestra los animales del corral RECONSTRUIDOS a ese
 * instante (por lote: común y enfermería), editables como override del cálculo.
 * En `modoEdicion` es una sola fila, el corral queda read-only y se guarda con PATCH.
 */
export function AlimentarModal({
  initialCorralId,
  corralReadonly = false,
  modoEdicion,
  onClose,
  onSaved,
}: {
  initialCorralId?: number
  /** Corral no editable (modo edición). */
  corralReadonly?: boolean
  /** Si viene, el modal edita esa alimentación (una sola fila). */
  modoEdicion?: EdicionAlimentacion
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { data: corrales } = useSWR<CorralOpcion[]>('/corrales', fetcher)
  const { data: dietas } = useSWR<DietaOpcion[]>('/dietas', fetcher)

  const [idCorral, setIdCorral] = useState<string | number>(
    modoEdicion ? modoEdicion.idCorral : initialCorralId ?? '',
  )
  const [filas, setFilas] = useState<Fila[]>(() =>
    modoEdicion
      ? [
          {
            key: proxKey++,
            idDieta: modoEdicion.idDieta,
            fecha: modoEdicion.fecha,
            hora: (modoEdicion.hora || '12:00:00').slice(0, 5),
            cantidad: String(modoEdicion.cantidadKg),
            ajuste: null,
            ajusteCargando: false,
          },
        ]
      : [nuevaFila()],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Cache de reconstrucción de una sola entrada (siempre la última) + fetch
  // en vuelo (deduplica filas iguales simultáneas).
  const cacheRef = useRef<{ key: string; data: EstadoCorralLote[] } | null>(null)
  const vueloRef = useRef<{ key: string; promesa: Promise<EstadoCorralLote[]> } | null>(null)

  // Cualquier común activo (aunque esté vacío hoy): la reconstrucción es
  // histórica y una fecha pasada puede tener animales.
  const corralesActivos = useMemo(
    () => (corrales ?? []).filter((c) => c.activo && c.tipo === 'comun'),
    [corrales],
  )
  const dietasOpciones = useMemo(() => dietas ?? [], [dietas])

  const setFila = (key: number, patch: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const quitarFila = (key: number) => setFilas((fs) => fs.filter((f) => f.key !== key))

  const [nNuevas, setNNuevas] = useState('1')
  const cantidadRefs = useRef(new Map<number, HTMLInputElement | null>())

  const agregarFilas = (base: Fila | undefined, n: number, enIndice?: number) => {
    if (!Number.isFinite(n) || n <= 0) return
    const nuevas: Fila[] = []
    let anterior: Fila | undefined = base
    for (let i = 0; i < n; i++) {
      const nueva = nuevaFila(anterior)
      nuevas.push(nueva)
      anterior = nueva
    }
    setFilas((fs) => {
      if (enIndice == null || enIndice < 0) return [...fs, ...nuevas]
      const copia = [...fs]
      copia.splice(enIndice + 1, 0, ...nuevas)
      return copia
    })
    if (idCorral !== '') {
      for (const nueva of nuevas) void recalc(nueva.key, Number(idCorral), nueva.fecha, nueva.hora)
    }
    // Foco en cantidad de la primera fila nueva (tras el paint).
    const foco = nuevas[0]?.key
    if (foco != null) {
      requestAnimationFrame(() => {
        cantidadRefs.current.get(foco)?.focus()
      })
    }
  }

  // Enter en una celda (input) agrega una fila debajo heredando de la actual.
  // Se ignoran los Enter propios de los selects (ya preventDefault) y todo lo
  // que no sea un input (botones, popovers). En edición no agrega filas.
  const onFilaEnter = (e: KeyboardEvent, key: number) => {
    if (modoEdicion) return
    if (e.key !== 'Enter') return
    if (e.defaultPrevented) return
    const t = e.target as HTMLElement
    if (t.tagName !== 'INPUT') return
    e.preventDefault()
    const idx = filas.findIndex((f) => f.key === key)
    if (idx < 0) return
    agregarFilas(filas[idx], 1, idx)
  }

  const resumenAnimales = (f: Fila): string => {
    if (f.ajusteCargando) return '…'
    if (!f.ajuste || f.ajuste.length === 0) return 'Sin animales'
    const corral = f.ajuste.reduce((acc, a) => acc + a.nAnimales, 0)
    const enf = f.ajuste.reduce((acc, a) => acc + a.nAnimalesEnfermeria, 0)
    return `${corral} en corral${enf > 0 ? ` y ${enf} en enfermería` : ''}`
  }

  /** Fetch de la reconstrucción para una fila (precarga los conteos editables). */
  const recalc = async (key: number, corralId: number, fecha: string, hora: string) => {
    if (!corralId || !fecha) return
    const cacheKey = `${corralId}|${fecha}|${hora}`
    const cached = cacheRef.current
    if (cached?.key === cacheKey) {
      setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ajuste: cached.data } : f)))
      return
    }
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ajusteCargando: true } : f)))
    // Deduplica fetches concurrentes de la misma key (varias filas iguales).
    let vuelo = vueloRef.current
    if (!vuelo || vuelo.key !== cacheKey) {
      const promesa: Promise<EstadoCorralLote[]> = api
        .get<EstadoCorralLote[]>('/alimentaciones/estado-corral', {
          params: { idCorral: corralId, fecha, hora },
        })
        .then((r) => r.data ?? [])
      vuelo = { key: cacheKey, promesa }
      vueloRef.current = vuelo
      promesa.then(
        (data) => {
          cacheRef.current = { key: cacheKey, data }
          if (vueloRef.current?.key === cacheKey) vueloRef.current = null
        },
        () => {
          if (vueloRef.current?.key === cacheKey) vueloRef.current = null
        },
      )
    }
    try {
      const data = await vuelo.promesa
      setFilas((fs) =>
        fs.map((f) => (f.key === key ? { ...f, ajuste: data, ajusteCargando: false } : f)),
      )
    } catch {
      setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ajusteCargando: false } : f)))
    }
  }

  // Al abrir (con corral preseleccionado), precargar los conteos de cada fila.
  useEffect(() => {
    if (idCorral === '') return
    filas.forEach((f) => void recalc(f.key, Number(idCorral), f.fecha, f.hora))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cambiarCorral = (v: string | number) => {
    setIdCorral(v)
    if (v === '') return
    filas.forEach((f) => void recalc(f.key, Number(v), f.fecha, f.hora))
  }

  const setAjuste = (key: number, loteId: number, campo: 'nAnimales' | 'nAnimalesEnfermeria', v: string) => {
    const n = parseInt(v, 10)
    setFilas((fs) =>
      fs.map((f) => {
        if (f.key !== key || !f.ajuste) return f
        return {
          ...f,
          ajuste: f.ajuste.map((a) =>
            a.loteId === loteId ? { ...a, [campo]: isNaN(n) || n < 0 ? 0 : n } : a,
          ),
        }
      }),
    )
  }

  const filasValidas = filas.every((f) => {
    const n = parseFloat(f.cantidad.replace(',', '.'))
    if (f.idDieta === '' || !f.fecha || isNaN(n) || n <= 0) return false
    // Si los conteos están cargados (recalculados o editados), tiene que
    // haber al menos un animal en ese instante; si no, no se puede guardar.
    // Sin conteos (aún no recalculados), decide el server al guardar.
    if (f.ajuste == null) return true
    return f.ajuste.reduce((acc, a) => acc + a.nAnimales + a.nAnimalesEnfermeria, 0) > 0
  })
  const listo = idCorral !== '' && filas.length > 0 && filasValidas && !filas.some((f) => f.ajusteCargando)

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      if (modoEdicion) {
        const f = filas[0]
        await api.patch(`/alimentaciones/${modoEdicion.id}`, {
          idDieta: Number(f.idDieta),
          cantidadKg: parseFloat(f.cantidad.replace(',', '.')),
          fecha: f.fecha,
          hora: f.hora,
          // Siempre los conteos exhibidos (precargados o editados): lo
          // mostrado = lo guardado. Sin ajuste, el server reconstruye.
          ...(f.ajuste
            ? {
                ajuste: f.ajuste.map((a) => ({
                  loteId: a.loteId,
                  nAnimales: a.nAnimales,
                  nAnimalesEnfermeria: a.nAnimalesEnfermeria,
                })),
              }
            : {}),
        })
      } else {
        await api.post('/alimentaciones/masiva', {
          idCorral: Number(idCorral),
          filas: filas.map((f) => ({
            idDieta: Number(f.idDieta),
            cantidadKg: parseFloat(f.cantidad.replace(',', '.')),
            fecha: f.fecha,
            hora: f.hora,
            // Siempre los conteos exhibidos (precargados o editados).
            ...(f.ajuste
              ? {
                  ajuste: f.ajuste.map((a) => ({
                    loteId: a.loteId,
                    nAnimales: a.nAnimales,
                    nAnimalesEnfermeria: a.nAnimalesEnfermeria,
                  })),
                }
              : {}),
          })),
        })
      }
      await onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo registrar la alimentación.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-5xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {modoEdicion ? 'Editar alimentación' : 'Alimentar corral'}
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
          La cantidad se reparte entre los lotes del corral según sus animales vivos en ese
          instante (fecha + hora). Podés ajustar los conteos reconstruidos.
        </p>

        {/* Corral: único, siempre arriba (read-only al editar) */}
        {corralReadonly ? (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Corral</label>
            <div className={`${inputCls} w-full bg-muted/40 text-muted-foreground`}>
              {modoEdicion?.corralNombre ?? ''}
            </div>
          </div>
        ) : (
          <SelectAutocomplete
            label="Corral *"
            placeholder="Elegir corral..."
            value={idCorral}
            onChange={cambiarCorral}
            options={corralesActivos.map((c) => ({ value: c.id, label: c.nombre }))}
            clearable={false}
          />
        )}

        {/* Filas: spreadsheet (una alimentación por fila) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {modoEdicion ? 'Alimentación' : `Alimentaciones (${filas.length})`}
          </p>
          <div className="overflow-x-auto border border-border rounded-md">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                  <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dieta</th>
                  <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cantidad (kg)</th>
                  <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hora</th>
                  <th className="text-left px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Animales</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.key} onKeyDown={(e) => onFilaEnter(e, f.key)} className="align-middle">
                    <td className="p-2 w-[150px]">
                      <input
                        type="date"
                        value={f.fecha}
                        onChange={(e) => {
                          setFila(f.key, { fecha: e.target.value })
                          if (idCorral !== '') void recalc(f.key, Number(idCorral), e.target.value, f.hora)
                        }}
                        className={`${inputCls} w-full`}
                      />
                    </td>
                    <td className="p-2 min-w-[190px]">
                      <SelectAutocomplete
                        placeholder="Elegir dieta..."
                        value={f.idDieta}
                        onChange={(v) => setFila(f.key, { idDieta: v })}
                        options={dietasOpciones.map((d) => ({ value: d.id, label: `${d.nombre} (v${d.version})` }))}
                        clearable={false}
                      />
                    </td>
                    <td className="p-2 w-[110px]">
                      <NumeroInput
                        min={0}
                        step="0.01"
                        value={f.cantidad}
                        onChange={(v) => setFila(f.key, { cantidad: v })}
                        inputRef={(el) => {
                          if (el) cantidadRefs.current.set(f.key, el)
                          else cantidadRefs.current.delete(f.key)
                        }}
                        className={`${inputCls} w-full`}
                        placeholder="Ej: 2500"
                      />
                    </td>
                    <td className="p-2 w-[110px]">
                      <DetallePopover etiqueta={f.hora || '—'} titulo="Hora">
                        <div className="space-y-2">
                          <AtajosHora
                            value={f.hora}
                            onChange={(v) => {
                              setFila(f.key, { hora: v })
                              if (idCorral !== '') void recalc(f.key, Number(idCorral), f.fecha, v)
                            }}
                          />
                          <input
                            type="time"
                            value={f.hora}
                            onChange={(e) => {
                              setFila(f.key, { hora: e.target.value })
                              if (idCorral !== '') void recalc(f.key, Number(idCorral), f.fecha, e.target.value)
                            }}
                            className={`${inputCls} w-full`}
                          />
                        </div>
                      </DetallePopover>
                    </td>
                    <td className="p-2 min-w-[150px]">
                      {idCorral === '' ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : f.ajusteCargando ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" strokeWidth={2} /> Calculando…
                        </span>
                      ) : (
                        <DetallePopover
                          etiqueta={resumenAnimales(f)}
                          titulo="Animales en el momento"
                          ancho={440}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                Ajustables (override del cálculo)
                              </span>
                              <button
                                onClick={() => recalc(f.key, Number(idCorral), f.fecha, f.hora)}
                                title="Recalcular desde el histórico"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer shrink-0"
                              >
                                {f.ajusteCargando ? (
                                  <Loader2 className="size-3 animate-spin" strokeWidth={2} />
                                ) : (
                                  <RefreshCw className="size-3" strokeWidth={2} />
                                )}
                                Recalcular
                              </button>
                            </div>
                            {f.ajusteCargando ? (
                              <p className="text-xs text-muted-foreground">Calculando…</p>
                            ) : !f.ajuste || f.ajuste.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Sin animales en ese instante: no se puede guardar (probá otra fecha/hora).
                              </p>
                            ) : (
                              <div className="divide-y divide-border border border-border rounded-md">
                                <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  <span>Lote</span>
                                  <span className="w-24 text-right">En corral</span>
                                  <span className="w-24 text-right">Enfermería</span>
                                </div>
                                {f.ajuste.map((a) => (
                                  <div key={a.loteId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1.5">
                                    <span className="text-sm text-foreground truncate" title={a.loteNombre}>
                                      {a.loteNombre}
                                    </span>
                                    <NumeroInput
                                      min={0}
                                      value={a.nAnimales}
                                      onChange={(v) => setAjuste(f.key, a.loteId, 'nAnimales', v)}
                                      className={`${inputCls} w-24 text-right`}
                                    />
                                    <NumeroInput
                                      min={0}
                                      value={a.nAnimalesEnfermeria}
                                      onChange={(v) => setAjuste(f.key, a.loteId, 'nAnimalesEnfermeria', v)}
                                      className={`${inputCls} w-24 text-right`}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </DetallePopover>
                      )}
                    </td>
                    <td className="p-2 w-10">
                      {filas.length > 1 && (
                        <button
                          onClick={() => quitarFila(f.key)}
                          title="Quitar fila"
                          className="p-1 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                        >
                          <X className="size-3.5" strokeWidth={2} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!modoEdicion && (
            <div className="flex items-center justify-end gap-2">
              <NumeroInput
                min={1}
                value={nNuevas}
                onChange={setNNuevas}
                title="Cantidad de filas a agregar"
                className={`${inputCls} w-20 text-center`}
              />
              <button
                onClick={() =>
                  agregarFilas(filas[filas.length - 1], Math.max(1, parseInt(nNuevas, 10) || 1))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
              >
                <Plus className="size-3.5" strokeWidth={2} /> Agregar
              </button>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !listo}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {modoEdicion ? 'Guardar cambios' : `Registrar ${filas.length} alimentación${filas.length !== 1 ? 'es' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}