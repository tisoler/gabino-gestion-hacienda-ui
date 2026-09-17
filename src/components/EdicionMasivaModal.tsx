import { useMemo, useState } from 'react'
import { Loader2, RotateCcw, Wand2, X } from 'lucide-react'
import CatalogoSelect from './CatalogoSelect'
import { CategoriaSelect, PelajeSelect } from './AnimalCatalogos'
import SelectAutocomplete from './SelectAutocomplete'
import type { LoteDetalle, Animal } from '../pages/LoteDetalle'

interface ValoresAnimal {
  idRaza: string | number
  idCategoria: string | number
  idPelaje: string | number
}
type Campo = keyof ValoresAnimal

export interface EdicionMasivaValues {
  alcance: 'lote' | 'partida'
  idPartida?: number
  valores: {
    animalId: number
    idRaza?: number | null
    idCategoria?: number | null
    idPelaje?: number | null
  }[]
}

const vacio: ValoresAnimal = { idRaza: '', idCategoria: '', idPelaje: '' }
const labelAnimal = (a: Animal) =>
  a.caravana ? `Car. ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`

/**
 * Edición en masa de raza/categoría/pelaje. Arriba los campos "aplicar a
 * todos" (setean el valor en todos los animales del alcance); abajo el
 * listado permite ajustar cada animal individualmente. Campo sin cambio no se
 * envía; limpio → null (borra el valor).
 */
export function EdicionMasivaModal({
  lote,
  onClose,
  onOk,
}: {
  lote: LoteDetalle
  onClose: () => void
  onOk: (vals: EdicionMasivaValues) => Promise<void>
}) {
  const animales = useMemo(() => lote.animales ?? [], [lote])
  const partidas = lote.partidas ?? []
  const esMulti = partidas.length > 1

  const [alcance, setAlcance] = useState<'lote' | 'partida'>('lote')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const [general, setGeneral] = useState<ValoresAnimal>(vacio)
  // Valores por animal (inicializados con los actuales del lote).
  const [porAnimal, setPorAnimal] = useState<Record<number, ValoresAnimal>>(() =>
    Object.fromEntries(
      animales.map((a) => [
        a.id,
        {
          idRaza: a.idRaza ?? '',
          idCategoria: a.idCategoria ?? '',
          idPelaje: a.idPelaje ?? '',
        },
      ]),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Animales apartados (se sacan de la edición para hacerlos luego).
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())

  const afectados = useMemo(() => {
    if (alcance === 'lote') return animales
    const id = Number(idPartida)
    return id ? animales.filter((a) => a.idPartida === id) : []
  }, [alcance, idPartida, animales])

  // Incluidos = alcance menos los apartados (a ellos se aplican los cambios).
  const incluidos = useMemo(
    () => afectados.filter((a) => !excluidos.has(a.id)),
    [afectados, excluidos],
  )
  const apartados = useMemo(
    () => afectados.filter((a) => excluidos.has(a.id)),
    [afectados, excluidos],
  )

  const sacar = (id: number) =>
    setExcluidos((prev) => new Set(prev).add(id))
  const volver = (id: number) =>
    setExcluidos((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  // Campo general: se aplica a todos los animales del alcance (sólo al setear).
  const aplicarGeneral = (campo: Campo, v: string | number) => {
    setGeneral((g) => ({ ...g, [campo]: v }))
    if (v === '') return
    setPorAnimal((prev) => {
      const next = { ...prev }
      for (const a of incluidos) {
        next[a.id] = { ...(next[a.id] ?? vacio), [campo]: v }
      }
      return next
    })
  }

  const setCampoAnimal = (id: number, campo: Campo, v: string | number) =>
    setPorAnimal((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? vacio), [campo]: v },
    }))

  // Cambios por animal (sólo los que difieren del valor original).
  const valores = useMemo(() => {
    const lista: EdicionMasivaValues['valores'] = []
    for (const a of incluidos) {
      const orig: ValoresAnimal = {
        idRaza: a.idRaza ?? '',
        idCategoria: a.idCategoria ?? '',
        idPelaje: a.idPelaje ?? '',
      }
      const val = porAnimal[a.id] ?? orig
      const e: { animalId: number; idRaza?: number | null; idCategoria?: number | null; idPelaje?: number | null } = {
        animalId: a.id,
      }
      const push = (campo: Campo) => {
        if (String(val[campo]) === String(orig[campo])) return
        e[campo] = val[campo] === '' ? null : Number(val[campo])
      }
      push('idRaza')
      push('idCategoria')
      push('idPelaje')
      if (Object.keys(e).length > 1) lista.push(e)
    }
    return lista
  }, [incluidos, porAnimal])

  const listo =
    incluidos.length > 0 &&
    (alcance === 'lote' || idPartida !== '') &&
    valores.length > 0

  const submit = async () => {
    setError('')
    if (!listo) return
    setBusy(true)
    try {
      await onOk({
        alcance,
        ...(alcance === 'partida' ? { idPartida: Number(idPartida) } : {}),
        valores,
      })
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo aplicar la edición en masa.',
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
      <div className="w-full max-w-3xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Editar datos en masa</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Elegí los campos para aplicarlos a <strong>todos</strong> los animales del alcance
          (lote o partida) y, abajo, ajustá cada animal individualmente. Lo que no cambias no
          se toca.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
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
            <div />
          )}
        </div>

        {/* Campos generales: aplican a todos los del alcance */}
        <div className="border border-border rounded-md p-4 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aplicar a todos ({incluidos.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <CatalogoSelect
              tipo="raza"
              label="Raza"
              placeholder="Aplicar a todos..."
              value={general.idRaza}
              onChange={(v) => aplicarGeneral('idRaza', v)}
              clearable
            />
            <CategoriaSelect
              value={general.idCategoria}
              onChange={(v) => aplicarGeneral('idCategoria', v)}
            />
            <PelajeSelect
              value={general.idPelaje}
              onChange={(v) => aplicarGeneral('idPelaje', v)}
              idRaza={general.idRaza}
            />
          </div>
        </div>

        {/* Ajuste por animal */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Ajustar por animal · {incluidos.length} animales
            {apartados.length > 0 && ` · ${apartados.length} apartados`}
          </label>
          <div className="border border-border rounded-md overflow-hidden max-h-72 overflow-y-auto">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 px-3 py-2 bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Animal</span>
              <span>Raza</span>
              <span>Categoría</span>
              <span>Pelaje</span>
            </div>
            <div className="divide-y divide-border">
              {incluidos.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  {apartados.length > 0
                    ? 'Todos los animales del alcance están apartados.'
                    : alcance === 'partida' && idPartida === ''
                      ? 'Elegí la partida.'
                      : 'No hay animales en este alcance.'}
                </p>
              )}
              {incluidos.map((a) => {
                const val = porAnimal[a.id] ?? vacio
                return (
                  <div
                    key={a.id}
                    className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] items-start"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-foreground truncate">{labelAnimal(a)}</span>
                      <button
                        onClick={() => sacar(a.id)}
                        title="Apartar para editar después"
                        className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
                      >
                        <X className="size-3.5" strokeWidth={2} />
                      </button>
                    </div>
                    <CatalogoSelect
                      tipo="raza"
                      placeholder="Raza..."
                      value={val.idRaza}
                      onChange={(v) => setCampoAnimal(a.id, 'idRaza', v)}
                      clearable
                    />
                    <CatalogoSelect
                      tipo="categoria"
                      placeholder="Categoría..."
                      value={val.idCategoria}
                      onChange={(v) => setCampoAnimal(a.id, 'idCategoria', v)}
                      clearable
                    />
                    <CatalogoSelect
                      tipo="pelaje"
                      placeholder="Pelaje..."
                      value={val.idPelaje}
                      onChange={(v) => setCampoAnimal(a.id, 'idPelaje', v)}
                      clearable
                    />
                  </div>
                )
              })}
            </div>
          </div>
          {apartados.length > 0 && (
            <div className="border border-border rounded-md divide-y divide-border">
              <div className="px-3 py-2 bg-muted/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Apartados para después ({apartados.length}) — no se modifican
                </p>
              </div>
              {apartados.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-foreground truncate">{labelAnimal(a)}</span>
                  <button
                    onClick={() => volver(a.id)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer shrink-0"
                  >
                    <RotateCcw className="size-3.5" strokeWidth={2} /> Volver a incluir
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {valores.length} animal{valores.length !== 1 ? 'es' : ''} con cambios. Limpiar una
            celda borra ese valor del animal.
          </p>
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
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" strokeWidth={2} />}
            Aplicar cambios ({valores.length})
          </button>
        </div>
      </div>
    </div>
  )
}