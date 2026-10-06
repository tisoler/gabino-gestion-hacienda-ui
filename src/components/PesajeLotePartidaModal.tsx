import { useMemo, useState } from 'react'
import { Loader2, Undo2, X } from 'lucide-react'
import SelectAutocomplete from './SelectAutocomplete'
import { NumeroInput } from './NumeroInput'
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
// Filas de la tabla de animales: versión más baja para filas compactas.
const inputFilaCls =
  'px-2 py-1 bg-background border border-border rounded-md text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}
const labelAnimal = (a: FilaLotePartida) =>
  a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`

const extractMsg = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

/**
 * Modal de pesaje INICIAL e INTERMEDIO. Intermedio: alcance Lote / Partida
 * (sin selección individual), totales que se reparten ÷ N y filas por animal
 * prefilled y editables. Inicial (`modoInicial`): sin alcance, con selección
 * por animal (checkbox) y regla de partida por fecha (ver `gruposIniciales`).
 * Envía siempre modo 'animal'.
 */
export function PesajeLotePartidaModal({
  animales,
  partidas,
  titulo,
  descripcion,
  mostrarAlcance = true,
  fechaInicial,
  mostrarFecha = true,
  modoInicial = false,
  permiteNuevaPartida = false,
  gruposIniciales = [],
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
  /** Inicial: sin alcance, con selección de animales y partida por fecha. */
  modoInicial?: boolean
  /** Inicial: muestra el check "Es nueva partida" (sólo al agregar, no al editar). */
  permiteNuevaPartida?: boolean
  /** Iniciales existentes agrupados (fecha → partida con más animales). */
  gruposIniciales?: { fecha: string; partidaId: number; partidaNombre: string }[]
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
  const [nuevaPartida, setNuevaPartida] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<number>>(() => new Set(animales.map((a) => a.id)))
  const [quitados, setQuitados] = useState<Set<number>>(new Set())
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
    const base =
      modoInicial || !mostrarAlcance || alcance === 'lote'
        ? animales
        : (() => {
            const id = Number(idPartida)
            return id ? animales.filter((a) => a.idPartida === id) : []
          })()
    return modoInicial
      ? base.filter((a) => seleccion.has(a.id) && !quitados.has(a.id))
      : base
  }, [animales, alcance, idPartida, mostrarAlcance, modoInicial, seleccion, quitados])

  const n = incluidos.length

  // Inicial: se listan todos (para tildar/destildar); pesan sólo los elegidos.
  const visibles = modoInicial ? animales : incluidos

  // Inicial: el grupo con inicial en la fecha elegida (para unirse o separar).
  const grupoFecha = modoInicial
    ? gruposIniciales.find((g) => g.fecha === fecha)
    : undefined

  const toggleTodos = () => {
    setSeleccion((prev) => {
      if (prev.size === animales.length) return new Set<number>()
      return new Set(animales.map((a) => a.id))
    })
  }
  const toggleUno = (id: number) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Inicial: quitar un animal del pesaje (borra su inicial y lo saca de la
  // partida; luego puede sumarse a otro). Sólo filas con inicial previo;
  // toggle con deshacer. Los marcados se excluyen del guardado.
  const toggleQuitar = (id: number) => {
    const marcado = quitados.has(id)
    setQuitados((prev) => {
      const next = new Set(prev)
      if (marcado) next.delete(id)
      else next.add(id)
      return next
    })
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (marcado) next.add(id)
      else next.delete(id)
      return next
    })
  }

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
    (incluidos.length > 0 || (modoInicial && quitados.size > 0)) &&
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
        ...(modoInicial && permiteNuevaPartida ? { nuevaPartida } : {}),
        ...(modoInicial && quitados.size > 0 ? { quitar: [...quitados] } : {}),
      })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el pesaje.'))
    }
  }

  const cambiarFecha = (v: string) => {
    setFecha(v)
    if (modoInicial) setNuevaPartida(false)
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
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 flex flex-col gap-3 overflow-hidden">
        {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
        {notaParcial && (
          <p className="text-xs text-warning bg-warning-soft border border-warning/20 rounded-md px-2.5 py-1.5">
            {notaParcial}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {modoInicial && grupoFecha && permiteNuevaPartida ? (
            <label className="flex items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2 cursor-pointer hover:bg-accent transition-colors">
              <input
                type="checkbox"
                checked={nuevaPartida}
                onChange={(e) => setNuevaPartida(e.target.checked)}
                className="size-5 accent-primary shrink-0 cursor-pointer"
              />
              <span className="leading-tight">
                <span className="block text-sm font-medium text-foreground">Es nueva partida</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Separar de {grupoFecha.partidaNombre}, que ya tiene inicial el {fecha}
                </span>
              </span>
            </label>
          ) : !modoInicial && mostrarAlcance ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Alcance *</label>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-0.5 h-[34px]">
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
                onChange={(e) => cambiarFecha(e.target.value)}
                className={`${inputCls} w-full`}
              />
            </div>
          ) : (
            <div />
          )}
        </div>

        {modoInicial && !grupoFecha && (
          <p className="text-xs text-muted-foreground">
            {gruposIniciales.length > 0
              ? 'La fecha no coincide con pesajes anteriores: se creará una nueva partida.'
              : 'Se creará la partida inicial.'}
          </p>
        )}

        {/* Totales */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Peso total (kg)</label>
            <NumeroInput
              min={0}
              step="0.01"
              value={pesoTotal}
              onChange={onTotalPeso}
              className={`${inputCls} w-full`}
              placeholder="Ej: 12000"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Desbaste total <span className="text-muted-foreground">(opcional)</span>
            </label>
            <NumeroInput
              min={0}
              step="0.01"
              value={desbasteTotal}
              onChange={onTotalDesbaste}
              className={`${inputCls} w-full`}
              placeholder="Ej: 200"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          El total se reparte ÷ {n} al cambiarlo; si editás un animal, se recalcula el total.
        </p>

        {/* Tabla por animal */}
        {modoInicial && animales.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Seleccionados {seleccion.size} de {animales.length}
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={animales.length > 0 && seleccion.size === animales.length}
                onChange={toggleTodos}
                className="size-4 accent-primary cursor-pointer"
              />
              Todos
            </label>
          </div>
        )}
        <div className="border border-border rounded-md divide-y divide-border min-h-0 overflow-y-auto max-h-72">
          {visibles.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {mostrarAlcance && alcance === 'partida' && idPartida === ''
                ? 'Elegí la partida.'
                : 'No hay animales en este alcance.'}
            </p>
          )}
          {visibles.map((a) => {
            const marcado = modoInicial && quitados.has(a.id)
            const conInicial = modoInicial && a.pesoActual != null
            return (
            <div key={a.id} className={`flex items-center gap-2 px-3 py-1 min-h-[36px] ${marcado ? 'opacity-50' : ''}`}>
              {modoInicial && (
                <input
                  type="checkbox"
                  checked={seleccion.has(a.id)}
                  disabled={marcado}
                  onChange={() => toggleUno(a.id)}
                  aria-label={`Seleccionar ${labelAnimal(a)}`}
                  className="size-4 accent-primary shrink-0 cursor-pointer disabled:cursor-not-allowed"
                />
              )}
              {conInicial && (
                <button
                  onClick={() => toggleQuitar(a.id)}
                  title={marcado ? 'Deshacer (volver a incluir)' : 'Quitar del pesaje (borra su inicial y lo saca de la partida)'}
                  className="p-1 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors shrink-0 cursor-pointer"
                >
                  {marcado ? <Undo2 className="size-4" strokeWidth={2} /> : <X className="size-4" strokeWidth={2} />}
                </button>
              )}
              <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={labelAnimal(a)}>
                {labelAnimal(a)}
                {marcado && (
                  <span className="ml-1.5 inline-flex text-[9px] font-semibold uppercase tracking-wide text-warning bg-warning-soft rounded-full px-1.5 py-0.5">
                    Se quitará
                  </span>
                )}
              </span>
              <NumeroInput
                min={0}
                step="0.01"
                value={filas[a.id]?.peso ?? ''}
                onChange={(v) => onFilaPeso(a.id, v)}
                disabled={marcado}
                className={`${inputFilaCls} flex-1 min-w-0`}
                placeholder="Peso (kg)"
              />
              <NumeroInput
                min={0}
                step="0.01"
                value={filas[a.id]?.desbaste ?? ''}
                onChange={(v) => onFilaDesbaste(a.id, v)}
                disabled={marcado}
                className={`${inputFilaCls} flex-1 min-w-0`}
                placeholder="Desbaste"
                title="Desbaste (opcional)"
              />
            </div>
            )
          })}
        </div>

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