import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import SelectAutocomplete from './SelectAutocomplete'
import { round2, hoyIso, type CargarPesajesPayload, type PartidaDto } from '../lib/pesos'

export interface FilaLotePartida {
  id: number
  nAnimal: number | null
  caravana: string | null
  idPartida?: number | null
  /** Peso ya cargado en este contexto (para prellenar y corregir). */
  pesoActual: number | null
  /** Desbaste ya cargado en este contexto. */
  desbasteActual: number | null
}

const inputCls =
  'px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}
const labelAnimal = (a: FilaLotePartida) =>
  a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`

const extractMsg = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

/**
 * Modal de pesaje INICIAL e INTERMEDIO: alcance Lote / Partida (sin selección
 * individual), totales (peso + desbaste) que se reparten ÷ N y filas por
 * animal prefilled y editables (incluidos los salidos que ya tienen pesaje en
 * ese contexto, para corregir). Envía siempre modo 'animal'.
 */
export function PesajeLotePartidaModal({
  animales,
  partidas,
  titulo,
  descripcion,
  mostrarAlcance = true,
  fechaInicial,
  mostrarFecha = true,
  submitLabel,
  busy,
  notaParcial,
  onClose,
  onOk,
}: {
  animales: FilaLotePartida[]
  partidas: PartidaDto[]
  titulo: string
  descripcion?: string
  mostrarAlcance?: boolean
  fechaInicial?: string | null
  mostrarFecha?: boolean
  submitLabel: string
  busy?: boolean
  notaParcial?: string
  onClose: () => void
  onOk: (p: CargarPesajesPayload) => Promise<void>
}) {
  const esMulti = partidas.length > 1
  const [alcance, setAlcance] = useState<'lote' | 'partida'>('lote')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const [fecha, setFecha] = useState(fechaInicial || hoyIso())
  const [pesoTotal, setPesoTotal] = useState('')
  const [desbasteTotal, setDesbasteTotal] = useState('')
  const [error, setError] = useState('')
  const [filas, setFilas] = useState<Record<number, { peso: string; desbaste: string }>>(
    () =>
      Object.fromEntries(
        animales.map((a) => [
          a.id,
          {
            peso: a.pesoActual != null ? String(a.pesoActual) : '',
            desbaste: a.desbasteActual != null ? String(a.desbasteActual) : '',
          },
        ]),
      ),
  )

  const incluidos = useMemo(() => {
    if (!mostrarAlcance || alcance === 'lote') return animales
    const id = Number(idPartida)
    return id ? animales.filter((a) => a.idPartida === id) : []
  }, [animales, alcance, idPartida, mostrarAlcance])

  const n = incluidos.length

  const repartir = (campo: 'peso' | 'desbaste', total: number) => {
    if (n === 0) return
    const per = round2(total / n)
    setFilas((s) =>
      Object.fromEntries(
        incluidos.map((a) => [
          a.id,
          {
            peso: campo === 'peso' ? String(per) : (s[a.id]?.peso ?? ''),
            desbaste: campo === 'desbaste' ? String(per) : (s[a.id]?.desbaste ?? ''),
          },
        ]),
      ),
    )
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
    setFilas((s) => ({ ...s, [id]: { ...(s[id] ?? { desbaste: '' }), peso: v } }))
    let suma = 0
    for (const a of incluidos) suma += parseNum(a.id === id ? v : (filas[a.id]?.peso ?? '')) ?? 0
    setPesoTotal(round2(suma) ? String(round2(suma)) : '')
  }
  const onFilaDesbaste = (id: number, v: string) => {
    setFilas((s) => ({ ...s, [id]: { ...(s[id] ?? { peso: '' }), desbaste: v } }))
    let suma = 0
    for (const a of incluidos) suma += parseNum(a.id === id ? v : (filas[a.id]?.desbaste ?? '')) ?? 0
    setDesbasteTotal(round2(suma) ? String(round2(suma)) : '')
  }

  const faltan = incluidos.some((a) => (parseNum(filas[a.id]?.peso ?? '') ?? 0) <= 0)
  const listo =
    incluidos.length > 0 &&
    !faltan &&
    (!mostrarAlcance || alcance === 'lote' || idPartida !== '') &&
    !!fecha &&
    !busy

  const submit = async () => {
    setError('')
    if (!listo) return
    try {
      await onOk({
        fecha,
        modo: 'animal',
        animales: incluidos.map((a) => {
          const peso = parseNum(filas[a.id]?.peso ?? '') as number
          const desb = parseNum(filas[a.id]?.desbaste ?? '')
          return { animalId: a.id, peso, ...(desb != null ? { desbaste: desb } : {}) }
        }),
      })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el pesaje.'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
        {notaParcial && (
          <p className="text-xs text-warning bg-warning-soft border border-warning/20 rounded-md px-2.5 py-1.5">
            {notaParcial}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {mostrarAlcance ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Alcance *</label>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-0.5">
                {(
                  [
                    { value: 'lote', label: 'Lote' },
                    { value: 'partida', label: 'Partida' },
                  ] as const
                ).map((op) => (
                  <button
                    key={op.value}
                    onClick={() => setAlcance(op.value)}
                    disabled={op.value === 'partida' && !esMulti}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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
          ) : (
            <div />
          )}
          {mostrarAlcance && alcance === 'partida' ? (
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
          ) : mostrarFecha ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Totales */}
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
        <p className="text-xs text-muted-foreground">
          El total se reparte ÷ {n} al cambiarlo; si editás un animal, se recalcula el total.
        </p>

        {/* Tabla por animal */}
        <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
          {incluidos.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {mostrarAlcance && alcance === 'partida' && idPartida === ''
                ? 'Elegí la partida.'
                : 'No hay animales en este alcance.'}
            </p>
          )}
          {incluidos.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-2 min-h-[52px]">
              <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={labelAnimal(a)}>
                {labelAnimal(a)}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={filas[a.id]?.peso ?? ''}
                onChange={(e) => onFilaPeso(a.id, e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
                placeholder="Peso (kg)"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={filas[a.id]?.desbaste ?? ''}
                onChange={(e) => onFilaDesbaste(a.id, e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
                placeholder="Desbaste"
                title="Desbaste (opcional)"
              />
            </div>
          ))}
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
            disabled={!listo}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitLabel} ({incluidos.length})
          </button>
        </div>
      </div>
    </div>
  )
}