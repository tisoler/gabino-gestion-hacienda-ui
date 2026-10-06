import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import SelectAutocomplete from './SelectAutocomplete'
import type { EditorAnimalRow } from './EditorPesos'
import {
  SeleccionAnimalesPesos,
  type DatosSeleccionPesos,
} from './SeleccionAnimalesPesos'
import type { CargarPesajesPayload, PartidaDto } from '../lib/pesos'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const inicialDatos = (): DatosSeleccionPesos => ({
  seleccion: [],
  pesos: {},
  desbastes: {},
})

/**
 * Pesaje final con alcance Lote / Partida / Animales, sobre los animales SIN
 * pesaje final (restantes). Usa la misma entrada de pesos unificada que la
 * salida (totales arriba + tabla). Envía modo 'animal' (crea los finales).
 */
export function PesajeFinalModal({
  animales,
  partidas,
  onClose,
  onOk,
}: {
  /** Animales vivos SIN pesaje final (los restantes), con su partida. */
  animales: (EditorAnimalRow & { idPartida?: number | null })[]
  partidas: PartidaDto[]
  onClose: () => void
  onOk: (p: CargarPesajesPayload) => Promise<void>
}) {
  const esMulti = partidas.length > 1
  const [alcance, setAlcance] = useState<'lote' | 'partida' | 'animales'>('lote')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [datos, setDatos] = useState<DatosSeleccionPesos>(inicialDatos)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Filas para la entrada de pesos (todos sin final → editables).
  const filas = useMemo(
    () =>
      animales.map((a) => ({
        id: a.id,
        nAnimal: a.nAnimal,
        caravana: a.caravana,
        tieneFinal: false,
        pesoFinal: null,
        idPartida: a.idPartida,
      })),
    [animales],
  )

  // Candidatos por alcance.
  const candidatos = useMemo(() => {
    if (alcance === 'lote') return filas
    if (alcance === 'partida') {
      const id = Number(idPartida)
      return id ? filas.filter((a) => a.idPartida === id) : []
    }
    return filas
  }, [alcance, idPartida, filas])

  // Objetivo: para Animales = los seleccionados.
  const objetivo = useMemo(() => {
    if (alcance === 'animales') return candidatos.filter((a) => datos.seleccion.includes(a.id))
    return candidatos
  }, [alcance, datos.seleccion, candidatos])

  const faltanPesos = objetivo.some((a) => !(datos.pesos[a.id] > 0))
  const listo =
    objetivo.length > 0 &&
    !faltanPesos &&
    (alcance !== 'partida' || idPartida !== '') &&
    !!fecha

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      await onOk({
        fecha,
        modo: 'animal',
        animales: objetivo.map((a) => ({
          animalId: a.id,
          peso: datos.pesos[a.id],
          ...(datos.desbastes[a.id] != null ? { desbaste: datos.desbastes[a.id] } : {}),
        })),
      })
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar el pesaje final.',
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
      <div className="w-full max-w-4xl bg-card border border-border rounded-lg shadow-xl p-6 flex flex-col gap-3 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-foreground">Agregar pesaje final</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 flex flex-col gap-3 overflow-hidden">
        <p className="text-xs text-muted-foreground">
          Peso final de los animales que aún no lo tienen ({animales.length} restantes). Elegí el
          alcance y cargá el total (se reparte ÷ N) o cada animal; con desbaste opcional.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Alcance *</label>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-muted/40 p-0.5 h-[38px]">
              {(
                [
                  { value: 'lote', label: 'Lote' },
                  { value: 'partida', label: 'Partida' },
                  { value: 'animales', label: 'Animales' },
                ] as const
              ).map((op) => (
                <button
                  key={op.value}
                  onClick={() => setAlcance(op.value)}
                  disabled={op.value === 'partida' && !esMulti}
                  className={`inline-flex items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    alcance === op.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
          {alcance === 'partida' ? (
            <SelectAutocomplete
              label="Partida *"
              placeholder="Elegir partida..."
              value={idPartida}
              onChange={setIdPartida}
              options={partidas.map((p) => ({
                value: p.id,
                label: `${p.nombre} (${p.nAnimales} animales)`,
              }))}
              clearable={false}
            />
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Fecha del pesaje *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
          )}
        </div>

        {/* Entrada de pesos unificada (totales + tabla) */}
        <SeleccionAnimalesPesos
          key={`${alcance}-${idPartida}`}
          animales={candidatos}
          seleccionable={alcance === 'animales'}
          titulo={
            alcance === 'animales' ? 'Seleccioná los animales' : 'Animales sin pesaje final'
          }
          onDatos={setDatos}
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
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
            Guardar pesaje final ({objetivo.length})
          </button>
        </div>
      </div>
    </div>
  )
}