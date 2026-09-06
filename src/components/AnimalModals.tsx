import { useState } from 'react'
import useSWR from 'swr'
import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  Stethoscope,
  Undo2,
  X,
} from 'lucide-react'
import { fetcher } from '../lib/api'
import CatalogoSelect from './CatalogoSelect'
import { ESTADO_ANIMAL_LABELS, TIPOS_MOVIMIENTO } from '../constantes'

export interface EnfermeriaOpcion {
  id: number
  nombre: string
}

export interface AnimalMovimiento {
  id: number
  tipo: string
  estadoAntes: string | null
  estadoDespues: string | null
  corralOrigen: string | null
  corralDestino: string | null
  motivo: string | null
  idUsuario: string | null
  usuarioNombre: string | null
  fecha: string
}

const ModalShell = ({
  titulo,
  onClose,
  children,
}: {
  titulo: string
  onClose: () => void
  children: React.ReactNode
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
    <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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
      {children}
    </div>
  </div>
)

const Acciones = ({
  onClose,
  onConfirm,
  busy,
  confirmLabel,
  confirmIcon,
  disabled,
}: {
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  confirmLabel: string
  confirmIcon?: React.ReactNode
  disabled?: boolean
}) => (
  <div className="flex justify-end gap-2 pt-1">
    <button
      onClick={onClose}
      className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
    >
      Cancelar
    </button>
    <button
      onClick={onConfirm}
      disabled={busy || disabled}
      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : confirmIcon}
      {confirmLabel}
    </button>
  </div>
)

/**
 * Modal de envío a enfermería: pide la razón/enfermedad (catálogo `motivo`
 * con alta inline) y, si hay más de una enfermería activa, el corral destino.
 */
export function EnviarEnfermeriaModal({
  animalLabel,
  enfermerias,
  onClose,
  onOk,
}: {
  animalLabel: string
  /** Enfermerías activas de la empresa (si viene 1 sola se usa directo). */
  enfermerias: EnfermeriaOpcion[]
  onClose: () => void
  onOk: (motivoId: number, idCorral?: number) => Promise<void>
}) {
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [idCorral, setIdCorral] = useState<string | number>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hayQueElegir = enfermerias.length > 1

  const submit = async () => {
    if (!motivoId) {
      setError('Indicá la razón o enfermedad.')
      return
    }
    if (hayQueElegir && !idCorral) {
      setError('Elegí el corral de enfermería.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(Number(motivoId), hayQueElegir ? Number(idCorral) : undefined)
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo enviar a enfermería.',
      )
      setBusy(false)
    }
  }

  return (
    <ModalShell titulo={`Enviar "${animalLabel}" a enfermería`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        El animal pasará al estado <strong>Enfermo</strong>. Se registra en su
        historial de movimientos.
      </p>
      <CatalogoSelect
        tipo="motivo"
        label="Razón / enfermedad *"
        placeholder="Buscar o agregar..."
        value={motivoId}
        onChange={setMotivoId}
      />
      {hayQueElegir && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            Corral de enfermería *
          </span>
          <div className="flex flex-wrap gap-2">
            {enfermerias.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setIdCorral(e.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                  idCorral === e.id
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones
        onClose={onClose}
        onConfirm={submit}
        busy={busy}
        confirmLabel="Enviar"
        confirmIcon={<Stethoscope className="size-4" strokeWidth={2} />}
      />
    </ModalShell>
  )
}

/**
 * Modal de alta de enfermería: pide el estado de salida (sano o muerto) y,
 * si muere, la causa.
 */
export function TraerEnfermeriaModal({
  animalLabel,
  onClose,
  onOk,
}: {
  animalLabel: string
  onClose: () => void
  onOk: (estado: 'sano' | 'muerto', motivoId?: number) => Promise<void>
}) {
  const [estado, setEstado] = useState<'sano' | 'muerto' | ''>('')
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!estado) {
      setError('Elegí el estado del animal.')
      return
    }
    if (estado === 'muerto' && !motivoId) {
      setError('Indicá la causa del fallecimiento.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(estado, motivoId ? Number(motivoId) : undefined)
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo traer de enfermería.',
      )
      setBusy(false)
    }
  }

  return (
    <ModalShell titulo={`Traer "${animalLabel}" de enfermería`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        ¿Cómo sale el animal? Se registra en su historial de movimientos.
      </p>
      <div className="flex gap-2">
        {(['sano', 'muerto'] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEstado(e)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
              estado === e
                ? e === 'muerto'
                  ? 'border-muted-foreground bg-muted text-foreground'
                  : 'border-success bg-success-soft text-success'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {e === 'muerto' ? (
              <AlertCircle className="size-4" strokeWidth={2} />
            ) : (
              <CheckCircle2 className="size-4" strokeWidth={2} />
            )}
            {ESTADO_ANIMAL_LABELS[e]}
          </button>
        ))}
      </div>
      {estado === 'muerto' && (
        <CatalogoSelect
          tipo="motivo"
          label="Causa del fallecimiento *"
          placeholder="Buscar o agregar..."
          value={motivoId}
          onChange={setMotivoId}
        />
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones
        onClose={onClose}
        onConfirm={submit}
        busy={busy}
        confirmLabel="Confirmar"
        confirmIcon={<Undo2 className="size-4" strokeWidth={2} />}
      />
    </ModalShell>
  )
}

/** Modal de cambio de estado a enfermo/muerto desde la grilla: pide la causa. */
export function CambioEstadoModal({
  animalLabel,
  estado,
  onClose,
  onOk,
}: {
  animalLabel: string
  estado: string
  onClose: () => void
  onOk: (motivoId: number) => Promise<void>
}) {
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!motivoId) {
      setError('Indicá la razón o causa.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(Number(motivoId))
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo actualizar el estado.',
      )
      setBusy(false)
    }
  }

  return (
    <ModalShell
      titulo={`Cambiar "${animalLabel}" a ${ESTADO_ANIMAL_LABELS[estado] ?? estado}`}
      onClose={onClose}
    >
      <p className="text-xs text-muted-foreground">
        Se registra en el historial de movimientos del animal.
      </p>
      <CatalogoSelect
        tipo="motivo"
        label={estado === 'muerto' ? 'Causa de muerte *' : 'Razón / enfermedad *'}
        placeholder="Buscar o agregar..."
        value={motivoId}
        onChange={setMotivoId}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones
        onClose={onClose}
        onConfirm={submit}
        busy={busy}
        confirmLabel="Guardar"
        confirmIcon={<CheckCircle2 className="size-4" strokeWidth={2} />}
      />
    </ModalShell>
  )
}

const fmtFechaMov = (f: string): string => {
  const d = new Date(f)
  return isNaN(d.getTime()) ? f : d.toLocaleString('es-AR')
}

const ESTADO_PILL: Record<string, string> = {
  sano: 'text-success bg-success-soft',
  enfermo: 'text-warning bg-warning-soft',
  muerto: 'text-muted-foreground bg-muted',
}

/** Historial de movimientos sanitarios del animal (fecha DESC). */
export function MovimientosModal({
  loteId,
  animal,
  onClose,
}: {
  loteId: number
  animal: { id: number; nAnimal: number | null; loteNombre?: string }
  onClose: () => void
}) {
  const { data: movimientos, isLoading } = useSWR<AnimalMovimiento[]>(
    `/lotes/${loteId}/animales/${animal.id}/movimientos`,
    fetcher,
  )

  return (
    <ModalShell
      titulo={`Movimientos · Animal ${animal.nAnimal ?? animal.id}${animal.loteNombre ? ` · ${animal.loteNombre}` : ''}`}
      onClose={onClose}
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : !movimientos || movimientos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <History className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Este animal todavía no tiene movimientos registrados.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {movimientos.map((m) => (
            <li key={m.id} className="p-3 bg-background border border-border rounded-md space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {fmtFechaMov(m.fecha)}
                </span>
              </div>
              {(m.estadoAntes || m.estadoDespues) && (
                <div className="flex items-center gap-1.5 text-xs">
                  {m.estadoAntes && (
                    <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-[10px] ${ESTADO_PILL[m.estadoAntes] ?? 'text-muted-foreground bg-muted'}`}>
                      {ESTADO_ANIMAL_LABELS[m.estadoAntes] ?? m.estadoAntes}
                    </span>
                  )}
                  {m.estadoAntes && m.estadoDespues && (
                    <span className="text-muted-foreground">→</span>
                  )}
                  {m.estadoDespues && (
                    <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-[10px] ${ESTADO_PILL[m.estadoDespues] ?? 'text-muted-foreground bg-muted'}`}>
                      {ESTADO_ANIMAL_LABELS[m.estadoDespues] ?? m.estadoDespues}
                    </span>
                  )}
                  {(m.corralOrigen || m.corralDestino) && (
                    <span className="text-muted-foreground truncate">
                      {m.corralOrigen ? `${m.corralOrigen} → ` : ''}
                      {m.corralDestino ?? ''}
                    </span>
                  )}
                </div>
              )}
              {m.motivo && (
                <p className="text-xs text-foreground">
                  <span className="text-muted-foreground">Motivo: </span>
                  {m.motivo}
                </p>
              )}
              {m.usuarioNombre && (
                <p className="text-[11px] text-muted-foreground">
                  Registró: {m.usuarioNombre}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  )
}
