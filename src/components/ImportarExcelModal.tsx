import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, ChevronUp, FileSpreadsheet, Loader2, Plus, ScanLine, Trash2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import { NumeroInput } from './NumeroInput'
import type { CorralOpcion } from '../lib/alimentacion'
import { CatalogoUnificadoSelect, type SeleccionCatalogo } from './CatalogoUnificadoSelect'
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

/**
 * Importar planilla Excel de alimentación (una hoja por lote/corral, tabla
 * izquierda FECHA|ALIMENTO|CANTIDAD|OBS). Se eligen las hojas y sus filas se
 * agregan al preview editable (corral/fecha/dieta/cantidad/hora). El cambio de
 * corral ("paso a corral N") se aplica a las filas siguientes. El guardado
 * real es un paso posterior.
 */
export function ImportarExcelModal({ onClose }: { onClose: () => void }) {
  const [hojas, setHojas] = useState<ExcelHoja[]>([])
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [filas, setFilas] = useState<PreviewFila[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [importColapsado, setImportColapsado] = useState(false)

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
    setNombreArchivo('')
    setError('')
    setImportColapsado(false)
  }

  const quitarFila = (key: number) => setFilas((prev) => prev.filter((f) => f.key !== key))
  const setFila = (key: number, patch: Partial<PreviewFila>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  /** Fila a la que le faltan datos (selector, cantidad, fecha, hora o corral). */
  const filaIncompleta = (f: PreviewFila): boolean =>
    !f.sel || !String(f.cantidad).trim() || !f.fecha || !f.hora || f.idCorral === ''
  const incompletas = filas.filter(filaIncompleta).length
  const totalFilasSeleccion = [...seleccionadas].reduce(
    (acc, n) => acc + (hojas.find((h) => h.nombre === n)?.filas.length ?? 0),
    0,
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-6xl bg-card border border-border rounded-lg shadow-xl p-6 flex flex-col gap-3 max-h-[94vh] h-[94vh] overflow-hidden">
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
        </p>

        <div className="shrink-0 border border-border rounded-md bg-muted/20 overflow-hidden">
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

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 min-h-[280px]">
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
              </div>
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_32px] gap-2 px-3 py-2 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-border">
                <span>Fecha</span>
                <span>Dieta / Trat. / Ins.</span>
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
                    className={`grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_32px] gap-2 px-3 py-1.5 items-start ${filaIncompleta(f) ? 'bg-warning-soft/60' : ''}`}
                  >
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
              disabled
              title="El guardado se habilita en una etapa posterior"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm opacity-50 cursor-not-allowed"
            >
              <ScanLine className="size-4" strokeWidth={2} />
              Guardar (próximamente)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
