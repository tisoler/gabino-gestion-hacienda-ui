import { useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Loader2, AlertCircle } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { CORRAL_TIPOS, ESTADO_ANIMAL_LABELS, getLoteColor } from '../constantes'
import {
  EnviarEnfermeriaModal,
  MovimientosModal,
  TraerEnfermeriaModal,
} from './AnimalModals'

interface TokenAnimal {
  animalId: number
  nAnimal: number | null
  estado: string
  loteId: number
  loteNombre: string
  loteColor: string | null
}

interface CorralMapaItem {
  id: number
  nombre: string
  tipo: string
  activo: boolean
  /** Comunes: lote ocupante (para validar drag & drop). */
  loteId: number | null
  animales: TokenAnimal[]
}

interface DragItem {
  animalId: number
  loteId: number
  /** true si la ficha está dentro de una enfermería. */
  enEnfermeria: boolean
  corralOrigenId: number
}

/**
 * Panel de corrales para la vista de Lotes (permiso lectura:corral).
 * Cada animal es una ficha con el color de su lote y su número:
 *  - anillo rojo = enfermo, atenuada = muerto, click abre el lote.
 *  - con escritura:lote se pueden ARRASTRAR las fichas:
 *      común → enfermería: enviar a ese corral de enfermería.
 *      enfermería → su corral (el del lote): traer de enfermería.
 *      enfermería → otra enfermería: reasignar.
 *    Cualquier otro destino es inválido (el animal viaja con su lote).
 */
export function CorralMapa() {
  const { permisos } = useAuth()
  const { mutate } = useSWRConfig()

  const canVer = permisos.includes('lectura:corral')
  const canMover = permisos.includes('escritura:lote')

  const { data: corrales, isLoading } = useSWR<CorralMapaItem[]>(
    canVer ? '/corrales/mapa' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const [drag, setDrag] = useState<DragItem | null>(null)
  const [overCorralId, setOverCorralId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // El drop NO mueve directo: abre el modal de enfermería (motivo obligatorio)
  // o el de alta de enfermería (estado de salida), según el destino.
  const [pendiente, setPendiente] = useState<
    | { tipo: 'a_enfermeria'; item: DragItem; destino: CorralMapaItem }
    | { tipo: 'de_enfermeria'; item: DragItem; destino: CorralMapaItem }
    | null
  >(null)
  const [movAnimal, setMovAnimal] = useState<TokenAnimal | null>(null)
  // HTML5 DnD puede disparar click tras soltar: se suprime el modal breve.
  const suppressClickRef = useRef(false)

  const destinoValido = (item: DragItem, c: CorralMapaItem): boolean => {
    if (c.tipo === CORRAL_TIPOS.ENFERMERIA) {
      // A una enfermería distinta (incluye reasignar entre enfermerías).
      return c.id !== item.corralOrigenId
    }
    // A un común: sólo si es el corral del lote del animal (traer de enfermería).
    return item.enEnfermeria && c.loteId === item.loteId
  }

  const clearDrag = () => {
    setDrag(null)
    setOverCorralId(null)
    suppressClickRef.current = true
    setTimeout(() => {
      suppressClickRef.current = false
    }, 50)
  }

  const handleDrop = (c: CorralMapaItem) => {
    const item = drag
    clearDrag()
    if (!item || !destinoValido(item, c)) return
    setError('')
    setPendiente({
      tipo: c.tipo === CORRAL_TIPOS.ENFERMERIA ? 'a_enfermeria' : 'de_enfermeria',
      item,
      destino: c,
    })
  }

  /** Persiste el movimiento confirmado en el modal y revalida el mapa. */
  const confirmar = async (fn: (base: string) => Promise<unknown>) => {
    if (!pendiente) return
    const { item } = pendiente
    const base = `/lotes/${item.loteId}/animales/${item.animalId}/enfermeria`
    setSaving(true)
    setError('')
    try {
      await fn(base)
      setPendiente(null)
      await mutate('/corrales/mapa')
      await mutate(`/lotes/${item.loteId}`)
    } catch (err) {
      console.error(err)
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo mover el animal.'
      setError(msg)
      setTimeout(() => setError(''), 4000)
      // Se relanza para que el modal abierto muestre el error y libere el busy.
      throw err
    } finally {
      setSaving(false)
    }
  }

  const labelDe = (item: DragItem) => {
    const tok = corrales
      ?.flatMap((s) => s.animales)
      .find((a) => a.animalId === item.animalId)
    return `Animal ${tok?.nAnimal ?? item.animalId}`
  }

  if (!canVer) return null

  return (
    <aside className="space-y-4 lg:sticky lg:top-4">
      <div>
        <h2 className="text-base font-semibold text-foreground tracking-tight">Corrales</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {canMover
            ? 'Arrastrá una ficha a enfermería (pedirá la razón) o al corral de su lote para traerla. Click: movimientos.'
            : 'Click en una ficha para ver sus movimientos. Los animales se muestran con el color de su lote.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-2.5 bg-destructive-soft border border-destructive/20 text-destructive text-xs rounded-md flex items-center gap-2"
        >
          <AlertCircle className="size-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : !corrales || corrales.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Todavía no hay corrales activos. Crealos desde la sección Corrales.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {corrales.map((c) => {
            const esValido = drag ? destinoValido(drag, c) : false
            const esSobre = esValido && overCorralId === c.id
            // Durante el drag: los destinos válidos quedan claros/resaltados y
            // los inválidos se ven deshabilitados.
            const dragCls = drag
              ? esValido
                ? esSobre
                  ? 'ring-2 ring-success shadow-md'
                  : 'ring-1 ring-primary/40 bg-card'
                : 'opacity-40 saturate-50'
              : ''
            return (
              <div
                key={c.id}
                onDragOver={(e) => {
                  if (!drag || !esValido) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overCorralId !== c.id) setOverCorralId(c.id)
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  if (overCorralId === c.id) setOverCorralId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(c)
                }}
                className={`premium-card p-4 space-y-3 transition-all ${dragCls}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{c.nombre}</p>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                      c.tipo === CORRAL_TIPOS.ENFERMERIA
                        ? 'text-info bg-info-soft'
                        : c.animales.length > 0
                          ? 'text-primary bg-primary-soft'
                          : 'text-muted-foreground bg-muted'
                    }`}
                  >
                    {c.tipo === CORRAL_TIPOS.ENFERMERIA
                      ? 'Enfermería'
                      : c.animales.length > 0
                        ? 'Ocupado'
                        : 'Libre'}
                  </span>
                </div>

                {c.animales.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    {c.tipo === CORRAL_TIPOS.ENFERMERIA ? 'Sin animales en enfermería.' : 'Libre.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 min-h-8">
                    {c.animales.map((a) => {
                      const muerto = a.estado === 'muerto'
                      const draggable = canMover && !muerto
                      const arrastrando = drag?.animalId === a.animalId
                      return (
                        <button
                          key={a.animalId}
                          draggable={draggable}
                          onDragStart={(e) => {
                            setDrag({
                              animalId: a.animalId,
                              loteId: a.loteId,
                              enEnfermeria: c.tipo === CORRAL_TIPOS.ENFERMERIA,
                              corralOrigenId: c.id,
                            })
                            setError('')
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', String(a.animalId))
                          }}
                          onDragEnd={clearDrag}
                          onClick={() => {
                            if (suppressClickRef.current) return
                            setMovAnimal(a)
                          }}
                          title={`${a.loteNombre} · ${ESTADO_ANIMAL_LABELS[a.estado] ?? a.estado} · click: movimientos${draggable ? ' · arrastrable' : ''}`}
                          className={`size-8 rounded-md text-white text-[11px] font-semibold flex items-center justify-center shadow-sm transition-transform ${
                            draggable
                              ? 'cursor-grab active:cursor-grabbing hover:scale-110'
                              : 'cursor-pointer hover:scale-110'
                          } ${a.estado === 'enfermo' ? 'ring-2 ring-red-500' : ''} ${
                            muerto ? 'opacity-40' : ''
                          } ${arrastrando ? 'opacity-30 scale-95' : ''}`}
                          style={{ backgroundColor: getLoteColor(a.loteColor) }}
                        >
                          {a.nAnimal ?? ''}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {saving && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground flex items-center gap-1.5"
        >
          <Loader2 className="size-3 animate-spin" strokeWidth={2} /> Guardando…
        </p>
      )}

      {pendiente?.tipo === 'a_enfermeria' && (
        <EnviarEnfermeriaModal
          animalLabel={labelDe(pendiente.item)}
          enfermerias={[{ id: pendiente.destino.id, nombre: pendiente.destino.nombre }]}
          onClose={() => setPendiente(null)}
          onOk={async (motivoId) => {
            await confirmar((base) =>
              api.post(base, { idCorral: pendiente.destino.id, idMotivo: motivoId }),
            )
          }}
        />
      )}

      {pendiente?.tipo === 'de_enfermeria' && (
        <TraerEnfermeriaModal
          animalLabel={labelDe(pendiente.item)}
          onClose={() => setPendiente(null)}
          onOk={async (estado, motivoId) => {
            await confirmar((base) =>
              api.delete(base, { data: { estado, ...(motivoId ? { idMotivo: motivoId } : {}) } }),
            )
          }}
        />
      )}

      {movAnimal && (
        <MovimientosModal
          loteId={movAnimal.loteId}
          animal={{
            id: movAnimal.animalId,
            nAnimal: movAnimal.nAnimal,
            loteNombre: movAnimal.loteNombre,
          }}
          onClose={() => setMovAnimal(null)}
        />
      )}
    </aside>
  )
}