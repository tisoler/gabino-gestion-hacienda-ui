import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, ScanLine, Trash2, Upload, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'
import { NumeroInput } from './NumeroInput'
import { CatalogoUnificadoSelect, type SeleccionCatalogo } from './CatalogoUnificadoSelect'
import type { CorralOpcion } from '../lib/alimentacion'
import { hoyIso, matchCorral } from '../lib/planilla-import'

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface OcrFila {
  linea: string
  fecha: string | null
  corral: string | null
  cambioCorral: boolean
  cantidad: number | null
}

interface OcrImagen {
  nombre: string
  corralHeader: string | null
  filas: OcrFila[]
}

interface PreviewFila {
  key: number
  fecha: string
  sel: SeleccionCatalogo | null
  /** Texto OCR para auto-match (dieta/tratamiento/insumo). */
  texto: string
  cantidad: string
  idCorral: string | number
  ref: string
}

let proxKey = 1

/**
 * Importar alimentaciones desde fotos o PDFs escaneados de planillas. Corre OCR en el
 * server, arma un preview best-effort (corral/fecha/dieta/cantidad) y deja editar cada
 * fila. El cambio de corral ("paso a corral N" en observaciones) se aplica a las filas
 * siguientes. El guardado real es un paso posterior.
 */
export function ImportarPlanillaModal({ onClose }: { onClose: () => void }) {
  const [filas, setFilas] = useState<PreviewFila[]>([])
  const [nombres, setNombres] = useState<string[]>([])
  const [cambiosCorral, setCambiosCorral] = useState(0)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  const { data: corrales } = useSWR<CorralOpcion[]>('/corrales', fetcher)

  const corralesActivos = useMemo(
    () => (corrales ?? []).filter((c) => c.activo && c.tipo === 'comun'),
    [corrales],
  )

  const procesar = async (files: FileList | File[]) => {
    setError('')
    setProcesando(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(files)) fd.append('archivos', f)
      const { data } = await api.post<{ imagenes: OcrImagen[] }>(
        '/alimentaciones/importar-ocr',
        fd,
      )
      const imagenes = data.imagenes ?? []
      const nuevas: PreviewFila[] = []
      let cambios = 0
      for (const img of imagenes) {
        let corral = img.corralHeader
        for (const f of img.filas) {
          if (f.cambioCorral) {
            corral = f.corral
            cambios += 1
            continue
          }
          nuevas.push({
            key: proxKey++,
            fecha: f.fecha ?? hoyIso(),
            sel: null,
            texto: f.linea.trim(),
            cantidad: f.cantidad != null ? String(f.cantidad) : '',
            idCorral: matchCorral(corral, corralesActivos) ?? '',
            ref: f.linea.trim(),
          })
        }
        // Sin filas de datos: una fila vacía sembrada con el corral header.
        if (img.filas.filter((f) => !f.cambioCorral).length === 0) {
          nuevas.push({
            key: proxKey++,
            fecha: hoyIso(),
            sel: null,
            texto: '',
            cantidad: '',
            idCorral: matchCorral(img.corralHeader, corralesActivos) ?? '',
            ref: '',
          })
        }
      }
      setFilas((prev) => [...prev, ...nuevas])
      setNombres((prev) => [...prev, ...imagenes.map((i) => i.nombre)])
      setCambiosCorral((prev) => prev + cambios)
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo procesar las imágenes.',
      )
    } finally {
      setProcesando(false)
    }
  }

  const agregarFila = () =>
    setFilas((prev) => [
      ...prev,
      { key: proxKey++, fecha: hoyIso(), sel: null, texto: '', cantidad: '', idCorral: '', ref: '' },
    ])

  const quitarFila = (key: number) => setFilas((prev) => prev.filter((f) => f.key !== key))
  const setFila = (key: number, patch: Partial<PreviewFila>) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-4xl bg-card border border-border rounded-lg shadow-xl p-6 flex flex-col gap-3 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-foreground">Importar planilla</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          Subí fotos o PDFs escaneados de planillas de alimentación. Se lee el corral del
          encabezado, las fechas por renglón y los cambios de corral ("paso a corral N").
          El preview se corrige a mano.
        </p>

        <label className="shrink-0 flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-4 py-6 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
          {procesando ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            <Upload className="size-4" strokeWidth={2} />
          )}
          {procesando ? 'Procesando…' : 'Elegir fotos o PDF (JPG/PNG/PDF)'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff,.pdf,application/pdf"
            multiple
            className="hidden"
            disabled={procesando}
            onChange={(e) => {
              if (e.target.files?.length) procesar(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {nombres.length > 0 && (
          <p className="text-xs text-muted-foreground shrink-0">
            {nombres.length} foto{nombres.length !== 1 ? 's' : ''} leída
            {nombres.length !== 1 ? 's' : ''}: {nombres.join(', ')} · {filas.length} fila
            {filas.length !== 1 ? 's' : ''} en el preview
            {cambiosCorral > 0 && ` · ${cambiosCorral} cambio${cambiosCorral !== 1 ? 's' : ''} de corral`}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Todavía no hay filas. Subí una foto o agregá filas a mano.
            </p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_32px] gap-2 px-3 py-2 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Fecha</span>
                <span>Dieta / Trat. / Ins.</span>
                <span>Cantidad</span>
                <span>Corral</span>
                <span />
              </div>
              <div className="divide-y divide-border">
                {filas.map((f) => (
                  <div
                    key={f.key}
                    title={f.ref ? `Texto detectado: ${f.ref}` : undefined}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_32px] gap-2 px-3 py-1.5 items-start"
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
                      title="Cantidad en kg"
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
            onClick={agregarFila}
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
