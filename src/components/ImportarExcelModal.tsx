import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, ChevronUp, FileSpreadsheet, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from './SelectAutocomplete'
import { NumeroInput } from './NumeroInput'
import type { CorralOpcion } from '../lib/alimentacion'
import { CatalogoUnificadoSelect, type SeleccionCatalogo } from './CatalogoUnificadoSelect'
import type { TratamientoFormValues } from './TratamientoModal'
import type { InsumoFormValues } from './InsumoModal'
import { hoyIso, matchCorral } from '../lib/planilla-import'

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface ExcelFila {
  linea: string
  fecha: string | null
  dieta: string | null
  cantidad: number | null
  turno: string | null
  hora: string
  corral: string | null
  cambioCorral: boolean
}

interface ExcelHoja {
  nombre: string
  corralHeader: string | null
  filas: ExcelFila[]
}

interface PreviewFila {
  key: number
  fecha: string
  sel: SeleccionCatalogo | null
  /** Texto del alimento para auto-match (dieta/tratamiento/insumo). */
  texto: string
  cantidad: string
  hora: string
  idCorral: string | number
  ref: string
}

let proxKey = 1

const esHojaBasura = (nombre: string): boolean => /^hoja\d*$/i.test(nombre.trim())

interface GuardarError {
  ref: string
  mensaje: string
}

interface GuardarResp {
  creadas: string[]
  errores: GuardarError[]
  alimentaciones: number
  aplicaciones: number
  animalesAlcanzados: number
}

/** Campos extra del temporal de un tratamiento nuevo (para el alta inline). */
const valsTratamiento = (sel: SeleccionCatalogo): object => {
  const t = sel.temp as TratamientoFormValues | undefined
  if (!t) return {}
  return {
    ...(t.descripcion ? { descripcion: t.descripcion } : {}),
    ...(t.precioReferencia != null ? { precioReferencia: t.precioReferencia } : {}),
  }
}

/** Campos extra del temporal de un insumo nuevo (para el alta inline). */
const valsInsumo = (sel: SeleccionCatalogo): object => {
  const v = sel.temp as InsumoFormValues | undefined
  if (!v) return {}
  return {
    ...(v.descripcion ? { descripcion: v.descripcion } : {}),
    ...(v.precioReferencia != null ? { precioReferencia: v.precioReferencia } : {}),
    ...(v.unidad ? { unidad: v.unidad } : {}),
  }
}

/**
 * Importar planilla Excel de alimentación (una hoja por lote/corral, tabla
 * izquierda FECHA|ALIMENTO|CANTIDAD|OBS). Se eligen las hojas y sus filas se
 * agregan al preview editable (corral/fecha/dieta/cantidad/hora). El cambio de
 * corral ("paso a corral N") se aplica a las filas siguientes. Al guardar, las
 * filas de dieta se dan de alta como alimentaciones y las de tratamiento o
 * insumo se aplican a los animales vivos del corral en cada fecha/hora (el
 * insumo suelto usa el tratamiento global "Aplicación insumo veterinario").
 */
export function ImportarExcelModal({
  onClose,
  onGuardado,
}: {
  onClose: () => void
  onGuardado: () => Promise<void> | void
}) {
  const { permisos } = useAuth()
  const [hojas, setHojas] = useState<ExcelHoja[]>([])
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [filas, setFilas] = useState<PreviewFila[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [importColapsado, setImportColapsado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [erroresGuardar, setErroresGuardar] = useState<GuardarError[]>([])
  const [resumenGuardar, setResumenGuardar] = useState('')

  const { data: corrales } = useSWR<CorralOpcion[]>('/corrales', fetcher)

  const corralesActivos = useMemo(
    () => (corrales ?? []).filter((c) => c.activo && c.tipo === 'comun'),
    [corrales],
  )

  const procesar = async (files: FileList | File[]) => {
    const f = Array.from(files)[0]
    if (!f) return
    setError('')
    setProcesando(true)
    try {
      const fd = new FormData()
      fd.append('archivo', f)
      const { data } = await api.post<{ hojas: ExcelHoja[] }>(
        '/alimentaciones/importar-xlsx',
        fd,
      )
      const hs = data.hojas ?? []
      setHojas(hs)
      setNombreArchivo(f.name)
      setSeleccionadas(new Set(hs.filter((h) => !esHojaBasura(h.nombre) && h.filas.length > 0).map((h) => h.nombre)))
      setFilas([])
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo procesar el archivo.',
      )
    } finally {
      setProcesando(false)
    }
  }

  const toggleHoja = (nombre: string) =>
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(nombre)) next.delete(nombre)
      else next.add(nombre)
      return next
    })

  const todasSeleccionadas = hojas.length > 0 && hojas.every((h) => seleccionadas.has(h.nombre))
  const toggleTodas = () =>
    setSeleccionadas((prev) => {
      if (hojas.every((h) => prev.has(h.nombre))) return new Set<string>()
      return new Set(hojas.map((h) => h.nombre))
    })

  const agregarSeleccionadas = () => {
    const nuevas: PreviewFila[] = []
    for (const h of hojas) {
      if (!seleccionadas.has(h.nombre)) continue
      let corral = h.corralHeader
      for (const f of h.filas) {
        if (f.cambioCorral) {
          corral = f.corral
          continue
        }
        nuevas.push({
          key: proxKey++,
          fecha: f.fecha ?? hoyIso(),
          sel: null,
          texto: (f.dieta ?? '').trim(),
          cantidad: f.cantidad != null ? String(f.cantidad) : '',
          hora: f.hora || '09:00',
          idCorral: matchCorral(corral, corralesActivos) ?? '',
          ref: `${h.nombre} · ${f.linea}`.trim(),
        })
      }
    }
    setFilas((prev) => [...prev, ...nuevas])
    setImportColapsado(true)
  }

  /** Vuelve al estado inicial: sin archivo, sin hojas y sin preview. */
  const quitarArchivo = () => {
    setHojas([])
    setSeleccionadas(new Set())
    setFilas([])
    setElegidas(new Set())
    setNombreArchivo('')
    setError('')
    setImportColapsado(false)
  }

  const quitarFila = (key: number) => {
    setFilas((prev) => prev.filter((f) => f.key !== key))
    setElegidas((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }
  const setFila = (key: number, patch: Partial<PreviewFila>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  /** Selección de filas del preview (para quitar en bloque). */
  const [elegidas, setElegidas] = useState<Set<number>>(new Set())
  const todasElegidas = filas.length > 0 && elegidas.size === filas.length
  const toggleElegida = (key: number) =>
    setElegidas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toggleTodasFilas = () =>
    setElegidas((prev) =>
      prev.size === filas.length ? new Set() : new Set(filas.map((f) => f.key)),
    )
  const quitarElegidas = () => {
    setFilas((prev) => prev.filter((f) => !elegidas.has(f.key)))
    setElegidas(new Set())
  }

  /** Fila a la que le faltan datos (selector, cantidad, fecha, hora o corral). */
  const filaIncompleta = (f: PreviewFila): boolean =>
    !f.sel || !String(f.cantidad).trim() || !f.fecha || !f.hora || f.idCorral === ''
  const incompletas = filas.filter(filaIncompleta).length
  const totalFilasSeleccion = [...seleccionadas].reduce(
    (acc, n) => acc + (hojas.find((h) => h.nombre === n)?.filas.length ?? 0),
    0,
  )
  const selCompletas = (f: PreviewFila): boolean =>
    elegidas.has(f.key) && !filaIncompleta(f)
  const nSelCompletas = filas.filter(selCompletas).length
  const hayVet = filas.some(
    (f) => elegidas.has(f.key) && f.sel != null && f.sel.tipo !== 'dieta',
  )
  const puedeGuardarVet = !hayVet || permisos.includes('escritura:veterinaria')
  const puedeGuardar =
    elegidas.size > 0 &&
    nSelCompletas === elegidas.size &&
    !guardando &&
    puedeGuardarVet

  /** Da de alta el preview: dietas → alimentaciones, trat/insumo → aplicaciones. */
  const guardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setError('')
    setErroresGuardar([])
    setResumenGuardar('')
    try {
      const paraGuardar = filas.filter((f) => elegidas.has(f.key))
      const payload = {
        filas: paraGuardar.map((f) => {
          const sel = f.sel!
          const base = {
            ref: String(f.key),
            fecha: f.fecha,
            hora: f.hora,
            idCorral: Number(f.idCorral),
            cantidad: Number(String(f.cantidad).replace(',', '.')),
          }
          if (sel.tipo === 'dieta') return { ...base, dieta: { idDieta: sel.id } }
          if (sel.tipo === 'tratamiento') {
            return {
              ...base,
              tratamiento: sel.nuevo
                ? {
                    nombre: sel.nombre,
                    ...valsTratamiento(sel),
                  }
                : { idTratamiento: sel.id },
            }
          }
          return {
            ...base,
            insumo: sel.nuevo
              ? { nombre: sel.nombre, ...valsInsumo(sel) }
              : { idInsumo: sel.id },
          }
        }),
      }
      const { data } = await api.post<GuardarResp>(
        '/alimentaciones/importar-guardar',
        payload,
      )
      if (data.errores.length === 0) {
        const partes = [
          data.alimentaciones > 0 && `${data.alimentaciones} alimentaciones`,
          data.aplicaciones > 0 &&
            `${data.aplicaciones} aplicaciones en ${data.animalesAlcanzados} animales`,
        ].filter(Boolean)
        setResumenGuardar(
          `Se guardaron ${data.creadas.length} filas${partes.length ? ` (${partes.join(' · ')})` : ''}.`,
        )
        await onGuardado()
        onClose()
      } else {
        // Las filas creadas salen del preview; las fallidas quedan para corregir.
        const creadas = new Set(data.creadas)
        setFilas((prev) => prev.filter((f) => !creadas.has(String(f.key))))
        setElegidas((prev) => {
          if (prev.size === 0) return prev
          const next = new Set<number>()
          for (const k of prev) if (!creadas.has(String(k))) next.add(k)
          return next
        })
        setErroresGuardar(data.errores)
        setResumenGuardar(
          data.creadas.length > 0
            ? `Se guardaron ${data.creadas.length} filas; ${data.errores.length} fallaron (ver detalle).`
            : `No se pudo guardar ninguna fila (${data.errores.length} errores).`,
        )
      }
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string | string[] } } })?.response
          ?.data?.message?.toString() || 'No se pudo guardar. Revisá las filas e intentá de nuevo.',
      )
    } finally {
      setGuardando(false)
    }
  }

  /** Etiqueta corta de una fila (para el detalle de errores). */
  const etiquetaFila = (key: number): string => {
    const f = filas.find((x) => x.key === key)
    if (!f) return `fila ${key}`
    const rubro = f.sel ? f.sel.nombre : (f.texto || 'sin rubro')
    return `${f.fecha || 'sin fecha'} · ${rubro}${f.ref ? ` (${f.ref})` : ''}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-7xl bg-card border border-border rounded-lg shadow-xl p-6 flex flex-col gap-3 max-h-[94vh] h-[94vh] overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-foreground">Importar planilla Excel</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          Subí el .xlsx (una hoja por lote, tabla izquierda FECHA|ALIMENTO|CANTIDAD|OBS).
          Elegí las hojas a importar; el turno M/T define la hora (09:00/15:00).
          Al guardar, las dietas se dan de alta como alimentaciones y los
          tratamientos/insumos se aplican a los animales del corral en cada fecha.
        </p>

        <div className="min-h-0 overflow-y-auto border border-border rounded-md bg-muted/20 shrink">
          {!importColapsado && (
            <div className="grid gap-3 p-3 md:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Archivo
                </p>
                {hojas.length === 0 ? (
                  <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-3 py-4 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
                    {procesando ? (
                      <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                    ) : (
                      <FileSpreadsheet className="size-4" strokeWidth={2} />
                    )}
                    {procesando ? 'Procesando…' : 'Elegir archivo .xlsx'}
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      disabled={procesando}
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          setImportColapsado(false)
                          procesar(e.target.files)
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      {procesando ? (
                        <Loader2 className="size-4 animate-spin shrink-0 text-muted-foreground" strokeWidth={2} />
                      ) : (
                        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                      )}
                      <span className="truncate text-xs font-medium text-foreground" title={nombreArchivo}>
                        {procesando ? 'Procesando…' : nombreArchivo}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer shrink-0">
                        Cambiar archivo
                        <input
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          disabled={procesando}
                          onChange={(e) => {
                            if (e.target.files?.length) procesar(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={quitarArchivo}
                        disabled={procesando}
                        title="Quitar el archivo y volver al estado inicial"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <X className="size-3.5" strokeWidth={2} /> Quitar
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Hojas {hojas.length > 0 && <>({hojas.length}) · {seleccionadas.size} elegidas</>}
                  </p>
                  {hojas.length > 0 && (
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={todasSeleccionadas}
                        onChange={toggleTodas}
                        className="size-4 accent-primary cursor-pointer"
                      />
                      Todas
                    </label>
                  )}
                </div>
                {hojas.length === 0 ? (
                  <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-4 text-center">
                    {procesando
                      ? 'Procesando el archivo…'
                      : 'Subí un archivo .xlsx para ver sus hojas acá y elegir cuáles importar.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {hojas.map((h) => (
                      <label
                        key={h.nombre}
                        title={`${h.filas.length} filas`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${seleccionadas.has(h.nombre)
                          ? 'border-primary bg-primary-soft text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(h.nombre)}
                          onChange={() => toggleHoja(h.nombre)}
                          className="size-3.5 accent-primary cursor-pointer"
                        />
                        {h.nombre} ({h.filas.length})
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {!importColapsado && hojas.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 pb-3">
              <button
                onClick={agregarSeleccionadas}
                disabled={seleccionadas.size === 0 || procesando}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                <Plus className="size-4" strokeWidth={2} /> Agregar al preview ({totalFilasSeleccion})
              </button>
              {seleccionadas.size === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  Elegí al menos una hoja para agregar sus filas al preview.
                </span>
              )}
            </div>
          )}
          {filas.length > 0 && (
            <button
              type="button"
              onClick={() => setImportColapsado((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-accent/50 border-t border-border transition-colors cursor-pointer"
              title={importColapsado ? 'Expandir archivo y hojas' : 'Colapsar archivo y hojas'}
              aria-expanded={!importColapsado}
            >
              {importColapsado ? (
                <>
                  <ChevronDown className="size-4 shrink-0" strokeWidth={2} />
                  <span className="truncate normal-case">
                    Expandir archivo y hojas · {nombreArchivo} · {hojas.length} hojas · {filas.length} en preview
                    {incompletas > 0 && ` (${incompletas} incompletas)`}
                  </span>
                </>
              ) : (
                <>
                  <ChevronUp className="size-4 shrink-0" strokeWidth={2} />
                  Colapsar archivo y hojas para dar más lugar a las filas
                </>
              )}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Todavía no hay filas. Subí el Excel y agregá hojas al preview.
            </p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Filas en preview ({filas.length})</span>
                {incompletas > 0 ? (
                  <span className="inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 text-warning-foreground bg-warning-soft border border-warning/40">
                    {incompletas} con datos faltantes
                  </span>
                ) : (
                  <span className="inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 text-success bg-success-soft">
                    Todas completas
                  </span>
                )}
                <span className="flex-1" />
                {elegidas.size > 0 && (
                  <button
                    type="button"
                    onClick={quitarElegidas}
                    className="inline-flex items-center gap-1 normal-case tracking-normal text-[11px] font-medium text-destructive hover:underline cursor-pointer"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} />
                    Quitar seleccionadas ({elegidas.size})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_32px] gap-2 px-3 py-2 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
                <input
                  type="checkbox"
                  checked={todasElegidas}
                  ref={(el) => {
                    if (el) el.indeterminate = elegidas.size > 0 && elegidas.size < filas.length
                  }}
                  onChange={toggleTodasFilas}
                  title={todasElegidas ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  aria-label={todasElegidas ? 'Deseleccionar todas las filas' : 'Seleccionar todas las filas'}
                  className="size-4 accent-primary cursor-pointer self-center justify-self-center"
                />
                <span>Fecha</span>
                <span>Dieta / Trat. / Ins.</span>
                <span>Detectado</span>
                <span>Cantidad</span>
                <span>Hora</span>
                <span>Corral</span>
                <span />
              </div>
              <div className="divide-y divide-border">
                {filas.map((f) => (
                  <div
                    key={f.key}
                    title={f.ref ? `Origen: ${f.ref}${filaIncompleta(f) ? ' · Faltan datos por completar' : ''}` : (filaIncompleta(f) ? 'Faltan datos por completar' : undefined)}
                    className={`grid grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_32px] gap-2 px-3 py-1.5 items-start ${filaIncompleta(f) ? 'bg-warning-soft/60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={elegidas.has(f.key)}
                      onChange={() => toggleElegida(f.key)}
                      title="Seleccionar fila"
                      aria-label={`Seleccionar fila ${f.ref || f.key}`}
                      className="size-4 accent-primary cursor-pointer self-center justify-self-center"
                    />
                    <input
                      type="date"
                      value={f.fecha}
                      onChange={(e) => setFila(f.key, { fecha: e.target.value })}
                      className={inputCls}
                    />
                    <CatalogoUnificadoSelect
                      placeholder="Dieta, tratamiento o insumo…"
                      value={f.sel}
                      textoInicial={f.texto || undefined}
                      onChange={(v) => setFila(f.key, { sel: v })}
                    />
                    <span
                      title={f.texto ? `Valor en la planilla: ${f.texto}` : undefined}
                      className="flex min-h-[34px] min-w-0 items-center truncate px-1 text-xs text-muted-foreground"
                    >
                      {f.texto || '—'}
                    </span>
                    <NumeroInput
                      min={0}
                      step="0.01"
                      value={f.cantidad}
                      onChange={(v) => setFila(f.key, { cantidad: v })}
                      className={inputCls}
                      placeholder="Kg"
                      title="Cantidad (kg)"
                    />
                    <input
                      type="time"
                      value={f.hora}
                      onChange={(e) => setFila(f.key, { hora: e.target.value })}
                      className={inputCls}
                      title="Hora (M → 09:00, T → 15:00)"
                    />
                    <SelectAutocomplete
                      placeholder="Corral…"
                      value={f.idCorral}
                      onChange={(v) => setFila(f.key, { idCorral: v })}
                      options={corralesActivos.map((c) => ({ value: c.id, label: c.nombre }))}
                    />
                    <button
                      onClick={() => quitarFila(f.key)}
                      title="Quitar fila"
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(resumenGuardar || erroresGuardar.length > 0) && (
          <div
            role={erroresGuardar.length > 0 ? 'alert' : 'status'}
            className={`shrink-0 border rounded-md px-3 py-2 text-xs space-y-1 max-h-32 overflow-y-auto ${erroresGuardar.length > 0
              ? 'border-destructive/40 bg-destructive-soft/50 text-foreground'
              : 'border-success/40 bg-success-soft/50 text-foreground'
              }`}
          >
            {resumenGuardar && <p className="font-medium">{resumenGuardar}</p>}
            {erroresGuardar.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5">
                {erroresGuardar.map((e) => (
                  <li key={e.ref}>
                    <span className="font-medium">{etiquetaFila(Number(e.ref))}</span>
                    {': '}{e.mensaje}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border shrink-0">
          <button
            onClick={() => setFilas((prev) => [...prev, { key: proxKey++, fecha: hoyIso(), sel: null, texto: '', cantidad: '', hora: '09:00', idCorral: '', ref: '' }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={2} /> Agregar fila
          </button>
          {error && <p role="alert" className="text-sm text-destructive flex-1 text-right">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={guardar}
              disabled={!puedeGuardar}
              title={
                filas.length === 0
                  ? 'Agregá hojas al preview para guardar'
                  : elegidas.size === 0
                    ? 'Seleccioná las filas a guardar (checkbox de la tabla)'
                    : nSelCompletas < elegidas.size
                      ? 'Completá los datos faltantes de las filas seleccionadas'
                      : !puedeGuardarVet
                        ? 'Se requiere escritura:veterinaria para guardar tratamientos e insumos'
                        : `Guardar ${elegidas.size} filas seleccionadas`
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {guardando ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <Save className="size-4" strokeWidth={2} />
              )}
              {guardando ? 'Guardando…' : `Guardar (${elegidas.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
