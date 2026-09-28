import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  Stethoscope,
  Undo2,
  X,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import CatalogoSelect from './CatalogoSelect'
import { AtajosHora } from './AtajosHora'
import {
  EstadoCargandoTratamientos,
  TratamientosEditor,
  type EditorTratamientoInicial,
} from './TratamientosEditor'
import {
  aTratamientosDto,
  fmtPrecio as fmtPrecioTrat,
  limpiarTratamientosPayload,
  validarTratamientosPayload,
  type HistorialItem,
  type TratamientoAplicadoView,
  type TratamientoPayload,
} from '../lib/veterinaria'
import { ESTADO_ANIMAL_LABELS, TIPOS_MOVIMIENTO } from '../constantes'

export interface EnfermeriaOpcion {
  id: number
  nombre: string
}

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const hoyIso = (): string => {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
const hhmmActual = (): string => {
  const d = new Date()
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

/** Inputs de fecha + hora del movimiento (default ahora). */
function FechaHora({
  fecha,
  hora,
  onFecha,
  onHora,
  apilado = false,
}: {
  fecha: string
  hora: string
  onFecha: (v: string) => void
  onHora: (v: string) => void
  /** true = hora en una línea debajo de la fecha (modales de enfermería). */
  apilado?: boolean
}) {
  if (apilado) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Fecha *</label>
          <input type="date" value={fecha} onChange={(e) => onFecha(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-foreground">Hora *</label>
            <AtajosHora value={hora} onChange={onHora} />
          </div>
          <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} className={`${inputCls} w-full`} />
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Fecha *</label>
        <input type="date" value={fecha} onChange={(e) => onFecha(e.target.value)} className={`${inputCls} w-full`} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-foreground">Hora *</label>
          <AtajosHora value={hora} onChange={onHora} />
        </div>
        <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} className={`${inputCls} w-full`} />
      </div>
    </div>
  )
}

const ModalShell = ({
  titulo,
  onClose,
  children,
  ancho = 'max-w-md',
  extra,
}: {
  titulo: string
  onClose: () => void
  children: React.ReactNode
  ancho?: string
  /** Contenido extra a la derecha del título (ej: botón agregar). */
  extra?: React.ReactNode
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
  >
    <div className={`w-full ${ancho} bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        <div className="flex items-center gap-1 shrink-0">
          {extra}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
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
  puedeTratar = false,
  onClose,
  onOk,
}: {
  animalLabel: string
  /** Enfermerías activas de la empresa (si viene 1 sola se usa directo). */
  enfermerias: EnfermeriaOpcion[]
  /** Con escritura:veterinaria muestra la sección opcional de tratamiento. */
  puedeTratar?: boolean
  onClose: () => void
  onOk: (motivoId: number, idCorral: number | undefined, fecha: string, hora: string, tratamientos: ReturnType<typeof aTratamientosDto>) => Promise<void>
}) {
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [idCorral, setIdCorral] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState(hhmmActual())
  const [tratPayload, setTratPayload] = useState<TratamientoPayload[]>([])
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
    const items = limpiarTratamientosPayload(tratPayload)
    const errTrat = validarTratamientosPayload(items)
    if (errTrat) {
      setError(errTrat)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(Number(motivoId), hayQueElegir ? Number(idCorral) : undefined, fecha, `${hora}:00`, aTratamientosDto(items))
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
      <FechaHora fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} apilado />
      <CatalogoSelect
        tipo="motivo"
        label="Razón / enfermedad *"
        placeholder="Buscar o agregar..."
        value={motivoId}
        onChange={setMotivoId}
      />
      {puedeTratar && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-foreground">
            Tratamiento <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <TratamientosEditor onChange={setTratPayload} />
        </div>
      )}
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
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${idCorral === e.id
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
  loteId,
  animalId,
  puedeTratar = false,
  onClose,
  onOk,
}: {
  animalLabel: string
  loteId: number
  animalId: number
  /** Con escritura:veterinaria muestra la sección opcional de tratamiento. */
  puedeTratar?: boolean
  onClose: () => void
  onOk: (estado: 'sano' | 'muerto', motivoId: number | undefined, fecha: string, hora: string, tratamientos: ReturnType<typeof aTratamientosDto>) => Promise<void>
}) {
  const [estado, setEstado] = useState<'sano' | 'muerto' | ''>('')
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState(hhmmActual())
  const [tratPayload, setTratPayload] = useState<TratamientoPayload[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Tratamientos registrados al llevarlo (para editar o agregar al traer).
  const { data: abiertos, isLoading: cargandoAbiertos } = useSWR<TratamientoAplicadoView[]>(
    puedeTratar ? `/lotes/${loteId}/animales/${animalId}/tratamientos/abiertos` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const inicialTrat: EditorTratamientoInicial[] = (abiertos ?? []).map((a) => ({
    idRegistro: a.id,
    idTratamiento: a.tratamiento.id,
    precio: a.precio,
    insumos: a.insumos.map((i) => ({ idRegistro: i.id, idInsumo: i.idInsumo, precio: i.precio })),
  }))

  const submit = async () => {
    if (!estado) {
      setError('Elegí el estado del animal.')
      return
    }
    if (estado === 'muerto' && !motivoId) {
      setError('Indicá la causa del fallecimiento.')
      return
    }
    const items = limpiarTratamientosPayload(tratPayload)
    const errTrat = validarTratamientosPayload(items)
    if (errTrat) {
      setError(errTrat)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(estado, motivoId ? Number(motivoId) : undefined, fecha, `${hora}:00`, aTratamientosDto(items))
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
      <FechaHora fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} apilado />
      <div className="flex gap-2">
        {(['sano', 'muerto'] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEstado(e)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${estado === e
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
      {puedeTratar && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-foreground">
            Tratamiento <span className="font-normal text-muted-foreground">(opcional: se precargan los del envío)</span>
          </span>
          {cargandoAbiertos ? (
            <EstadoCargandoTratamientos />
          ) : (
            <TratamientosEditor inicial={inicialTrat} onChange={setTratPayload} />
          )}
        </div>
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
  onOk: (motivoId: number, fecha: string, hora: string) => Promise<void>
}) {
  const [motivoId, setMotivoId] = useState<string | number>('')
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState(hhmmActual())
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
      await onOk(Number(motivoId), fecha, `${hora}:00`)
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
      <FechaHora fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} />
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

/** Historial combinado del animal: movimientos + tratamientos (fecha DESC). */
export function MovimientosModal({
  loteId,
  animal,
  puedeTratar = false,
  onClose,
}: {
  loteId: number
  animal: { id: number; nAnimal: number | null; caravana: string | null; estado: string; loteNombre?: string }
  /** Con escritura:veterinaria permite agregar tratamientos directos. */
  puedeTratar?: boolean
  onClose: () => void
}) {
  const historialKey = `/lotes/${loteId}/animales/${animal.id}/historial`
  const { data: historial, isLoading, mutate } = useSWR<HistorialItem[]>(
    historialKey,
    fetcher,
  )
  const { mutate: mutateGlobal } = useSWRConfig()
  const [agregando, setAgregando] = useState(false)

  return (
    <ModalShell
      titulo={`Movimientos · Animal ${animal.caravana ? `Car. ${animal.caravana}` : animal.nAnimal ?? animal.id}${animal.loteNombre ? ` · ${animal.loteNombre}` : ''}`}
      onClose={onClose}
      ancho="max-w-2xl"
      extra={
        (puedeTratar && animal.estado !== 'muerto' && animal.estado !== 'salido') ? (
          <button
            onClick={() => setAgregando(true)}
            title="Agregar tratamiento (sin movimiento)"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Agregar tratamiento"
          >
            <Stethoscope className="size-4" strokeWidth={2} />
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : !historial || historial.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <History className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Este animal todavía no tiene movimientos registrados.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {historial.map((it) => (
            <li
              key={`${it.kind}-${it.id}`}
              className="p-3 bg-background border border-border rounded-md space-y-1.5"
            >
              {it.kind === 'movimiento' ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {TIPOS_MOVIMIENTO[it.tipo] ?? it.tipo}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmtFechaMov(it.fecha)}
                    </span>
                  </div>
                  {(it.estadoAntes || it.estadoDespues) && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {it.estadoAntes && (
                        <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-[10px] ${ESTADO_PILL[it.estadoAntes] ?? 'text-muted-foreground bg-muted'}`}>
                          {ESTADO_ANIMAL_LABELS[it.estadoAntes] ?? it.estadoAntes}
                        </span>
                      )}
                      {it.estadoAntes && it.estadoDespues && (
                        <span className="text-muted-foreground">→</span>
                      )}
                      {it.estadoDespues && (
                        <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide text-[10px] ${ESTADO_PILL[it.estadoDespues] ?? 'text-muted-foreground bg-muted'}`}>
                          {ESTADO_ANIMAL_LABELS[it.estadoDespues] ?? it.estadoDespues}
                        </span>
                      )}
                      {(it.corralOrigen || it.corralDestino) && (
                        <span className="text-muted-foreground truncate">
                          {it.corralOrigen ? `${it.corralOrigen} → ` : ''}
                          {it.corralDestino ?? ''}
                        </span>
                      )}
                    </div>
                  )}
                  {it.motivo && (
                    <p className="text-xs text-foreground">
                      <span className="text-muted-foreground">Motivo: </span>
                      {it.motivo}
                    </p>
                  )}
                  {it.tratamientos.length > 0 && (
                    <div className="space-y-0.5 pt-0.5">
                      {it.tratamientos.map((t) => (
                        <p key={t.id} className="text-xs text-foreground">
                          <Stethoscope className="size-3 inline-block mr-1 text-info" strokeWidth={2} />
                          {t.nombre}
                          {t.precio != null && (
                            <span className="text-muted-foreground tabular-nums"> · ${fmtPrecioTrat(t.precio)}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                  {it.usuarioNombre && (
                    <p className="text-[11px] text-muted-foreground">
                      Registró: {it.usuarioNombre}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      <Stethoscope className="size-3.5 inline-block mr-1.5 text-info" strokeWidth={2} />
                      {it.tratamiento.nombre}
                      {it.precio != null && (
                        <span className="text-muted-foreground font-normal tabular-nums"> · ${fmtPrecioTrat(it.precio)}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Tratamiento {it.alcance === 'lote' ? 'al lote' : 'individual'}
                      {it.usuarioNombre ? ` · Registró: ${it.usuarioNombre}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {fmtFechaMov(it.fecha)}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {agregando && (
        <TratamientoAnimalModal
          animalLabel={animal.caravana ? `Car. ${animal.caravana}` : `Animal ${animal.nAnimal ?? animal.id}`}
          onClose={() => setAgregando(false)}
          onOk={async (fecha, hora, tratamientos) => {
            await api.post('/tratamientos/aplicar', {
              idLote: loteId,
              animalId: animal.id,
              fecha,
              hora,
              items: tratamientos,
            })
            setAgregando(false)
            await mutate()
            await mutateGlobal(`/lotes/${loteId}/balance`)
          }}
        />
      )}
    </ModalShell>
  )
}

/**
 * Modal para agregar tratamiento(s) a un animal sin movimiento (desde el
 * historial): sólo fecha/hora + tratamientos con insumos.
 */
export function TratamientoAnimalModal({
  animalLabel,
  onClose,
  onOk,
}: {
  animalLabel: string
  onClose: () => void
  onOk: (fecha: string, hora: string, tratamientos: ReturnType<typeof aTratamientosDto>) => Promise<void>
}) {
  const [fecha, setFecha] = useState(hoyIso())
  const [hora, setHora] = useState(hhmmActual())
  const [tratPayload, setTratPayload] = useState<TratamientoPayload[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const items = limpiarTratamientosPayload(tratPayload)
    if (items.length === 0) {
      setError('Agregá al menos un tratamiento.')
      return
    }
    const errTrat = validarTratamientosPayload(items)
    if (errTrat) {
      setError(errTrat)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(fecha, `${hora}:00`, aTratamientosDto(items))
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar el tratamiento.',
      )
      setBusy(false)
    }
  }

  return (
    <ModalShell titulo={`Tratar "${animalLabel}"`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        No registra movimiento: sólo el tratamiento (se muestra en el historial
        en orden cronológico).
      </p>
      <FechaHora fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} apilado />
      <TratamientosEditor onChange={setTratPayload} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Acciones
        onClose={onClose}
        onConfirm={submit}
        busy={busy}
        confirmLabel="Guardar tratamiento"
        confirmIcon={<Stethoscope className="size-4" strokeWidth={2} />}
      />
    </ModalShell>
  )
}
