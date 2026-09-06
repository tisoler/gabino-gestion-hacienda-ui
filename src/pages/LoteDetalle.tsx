import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSWR, { useSWRConfig } from 'swr'
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Stethoscope,
  Undo2,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { useVolver } from '../lib/navegacion'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import {
  CORRAL_TIPOS,
  ESTADO_ANIMAL_LABELS,
  ESTADOS_ANIMAL,
  PALETA_LOTE,
  getLoteColor,
} from '../constantes'

export interface Animal {
  id: number
  nAnimal: number | null
  sexo: string | null
  pelaje: string | null
  fechaPesajeIni: string | null
  pesoInicial: number | null
  desbasteIni: number
  pesoNetoIni: number | null
  fechaPesajeFin: string | null
  pesoFinal: number | null
  desbasteFin: number
  pesoNetoFin: number | null
  diferencia: number | null
  aumDiario: number | null
  observaciones: string | null
  estado: string
  idCorralEnfermeria: number | null
}

export interface LoteDetalle {
  id: number
  idEmpresa: number
  nombre: string
  descripcion: string | null
  fecha: string | null
  idCliente: string | null
  nombreCliente: string | null
  idCorral: number | null
  corralNombre: string | null
  color: string | null
  activo: boolean
  animales: Animal[]
}

interface CorralOpcion {
  id: number
  nombre: string
  tipo: string
  activo: boolean
  estado: string
  loteOcupante: { id: number; nombre: string; color: string | null } | null
  nAnimales: number
}

interface Cliente {
  uid: string
  nombreUsuario: string | null
  email: string | null
}

const aInputDate = (v?: string | null): string => {
  if (!v) return ''
  return v.slice(0, 10)
}

const fmtNum = (v: number | null, dec = 2): string => {
  if (v == null) return '—'
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const fmtFecha = (f?: string | null): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const ESTADO_BADGE: Record<string, string> = {
  sano: 'text-success bg-success-soft',
  enfermo: 'text-warning bg-warning-soft',
  muerto: 'text-muted-foreground bg-muted',
}

export default function LoteDetalle() {
  const { id } = useParams()
  // La ruta estática `/lotes/nueva` gana ante `/lotes/:id`, así que acá el
  // parámetro puede no venir: tratamos "sin id" o "nueva" como modo alta.
  const esNuevo = id === undefined || id === 'nueva'
  const loteId = esNuevo ? null : Number(id)
  const navigate = useNavigate()
  const volver = useVolver('/lotes')
  const { mutate } = useSWRConfig()
  const { permisos } = useAuth()
  // Los clientes ven el lote en modo sólo lectura (sin escritura:lote).
  const puedeEscribir = permisos.includes('escritura:lote')

  // El picker de clientes requiere lectura:cliente (anfitrión/sys-admin);
  // el operario crea lotes sin dueño.
  const puedeVerClientes = permisos.includes('lectura:cliente')
  const { data: clientes } = useSWR<Cliente[]>(
    puedeVerClientes ? '/clientes' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: corrals } = useSWR<CorralOpcion[]>(
    // GET /corrales está restringido a no-clientes en el server; sólo hace
    // falta para asignar corral (escritura:lote).
    puedeEscribir ? '/corrales' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const { data: lote, isLoading, mutate: mutateLote } = useSWR<LoteDetalle>(
    esNuevo ? null : `/lotes/${loteId}`,
    fetcher
  )

  const [animalModal, setAnimalModal] = useState<{ open: boolean; animal?: Animal }>({ open: false })
  const [enfPicker, setEnfPicker] = useState<{ open: boolean; animal?: Animal } | null>(null)
  const [error, setError] = useState('')

  const handleCrearLote = async (vals: LoteFormSubmit) => {
    const { data } = await api.post<{ id: number }>('/lotes', {
      nombre: vals.nombre,
      fecha: vals.fecha || undefined,
      descripcion: vals.descripcion || undefined,
      idCliente: vals.idCliente || undefined,
      idCorral: vals.idCorral ? Number(vals.idCorral) : undefined,
      color: vals.color || undefined,
    })
    await mutate('/lotes')
    navigate(`/lotes/${data.id}`, { replace: true })
  }

  const handleGuardarLote = async (vals: LoteFormSubmit) => {
    if (!lote) return
    await api.patch(`/lotes/${lote.id}`, {
      nombre: vals.nombre,
      fecha: vals.fecha || null,
      descripcion: vals.descripcion || null,
      idCliente: vals.idCliente || null,
      idCorral: vals.idCorral ? Number(vals.idCorral) : null,
      color: vals.color || null,
    })
    await mutateLote()
    await mutate('/lotes')
  }

  const handleAnimalSave = async (vals: AnimalFormValues) => {
    if (!lote) return
    if (animalModal.animal) {
      await api.patch(`/lotes/${lote.id}/animales/${animalModal.animal.id}`, vals)
    } else {
      await api.post(`/lotes/${lote.id}/animales`, vals)
    }
    await mutateLote()
  }

  const handleAnimalDelete = async (a: Animal) => {
    if (!lote) return
    if (!window.confirm(`¿Eliminar el animal ${a.nAnimal ?? a.id}?`)) return
    await api.delete(`/lotes/${lote.id}/animales/${a.id}`)
    await mutateLote()
  }

  const handleEstado = async (a: Animal, estado: string) => {
    if (!lote || a.estado === estado) return
    try {
      await api.patch(`/lotes/${lote.id}/animales/${a.id}`, { estado })
      await mutateLote()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo actualizar el estado.'))
    }
  }

  const enviarAEnfermeria = async (a: Animal, idCorral?: number) => {
    if (!lote) return
    try {
      await api.post(`/lotes/${lote.id}/animales/${a.id}/enfermeria`, idCorral ? { idCorral } : {})
      await mutateLote()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo enviar a enfermería.'))
    }
  }

  const traerDeEnfermeria = async (a: Animal) => {
    if (!lote) return
    try {
      await api.delete(`/lotes/${lote.id}/animales/${a.id}/enfermeria`)
      await mutateLote()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo traer del enfermería.'))
    }
  }

  /** Toggle enfermería: 0 = error, 1 = directo, N = picker. */
  const handleEnfermeriaToggle = async (a: Animal) => {
    if (!lote) return
    setError('')
    if (a.idCorralEnfermeria != null) {
      await traerDeEnfermeria(a)
      return
    }
    try {
      const { data } = await api.get<{ id: number; nombre: string }[]>('/corrales/enfermerias')
      if (data.length === 0) {
        setError('No hay un corral de enfermería activo en la empresa. Creá uno en Corrales.')
        return
      }
      if (data.length === 1) {
        await enviarAEnfermeria(a)
        return
      }
      setEnfPicker({ open: true, animal: a })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo listar las enfermerías.'))
    }
  }

  if (esNuevo && !puedeEscribir) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para crear lotes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        onClick={volver}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft className="size-4" strokeWidth={2} /> Volver a lotes
      </button>

      {error && (
        <div role="alert" className="p-3 bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {esNuevo ? (
        <LoteForm
          key="nuevo"
          clientes={clientes || []}
          corrals={corrals || []}
          submitLabel="Crear lote"
          onSubmit={handleCrearLote}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : lote ? (
        <>
          <LoteForm
            key={`lote-${lote.id}`}
            lote={lote}
            clientes={clientes || []}
            corrals={corrals || []}
            submitLabel="Guardar cambios"
            readOnly={!puedeEscribir}
            onSubmit={handleGuardarLote}
          />

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">Animales</h2>
                <p className="text-sm text-muted-foreground">
                  Pesajes de la partida ({lote.animales.length}).
                </p>
              </div>
              {puedeEscribir && (
                <button
                  onClick={() => setAnimalModal({ open: true })}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Plus className="size-4" strokeWidth={2} /> Agregar animal
                </button>
              )}
            </div>

            <Table<Animal>
              data={lote.animales}
              emptyMessage="Todavía no hay animales en este lote."
              columns={[
                {
                  header: 'N°',
                  accessor: (a) => (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-full shrink-0 border border-border"
                        style={{ backgroundColor: getLoteColor(lote.color) }}
                        aria-hidden
                      />
                      <span className="font-medium">{a.nAnimal ?? '—'}</span>
                      {a.idCorralEnfermeria != null && (
                        <span className="inline-flex text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                          Enfermería
                        </span>
                      )}
                    </div>
                  ),
                },
                { header: 'Sexo', accessor: (a) => <span className="text-muted-foreground">{a.sexo || '—'}</span> },
                { header: 'Pelaje', accessor: (a) => <span className="text-muted-foreground">{a.pelaje || '—'}</span> },
                { header: 'Peso ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoInicial)}</span> },
                { header: 'Neto ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoIni)}</span> },
                { header: 'Peso fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoFinal)}</span> },
                { header: 'Neto fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoFin)}</span> },
                { header: 'Diferencia', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.diferencia)}</span> },
                { header: 'Aum. diario', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.aumDiario, 4)}</span> },
                {
                  header: 'Estado',
                  accessor: (a) =>
                    puedeEscribir ? (
                      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                        {ESTADOS_ANIMAL.map((e) => (
                          <button
                            key={e}
                            onClick={() => handleEstado(a, e)}
                            title={ESTADO_ANIMAL_LABELS[e]}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                              a.estado === e
                                ? e === 'muerto'
                                  ? 'bg-muted-foreground text-background'
                                  : e === 'enfermo'
                                    ? 'bg-warning text-warning-foreground'
                                    : 'bg-success text-success-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {ESTADO_ANIMAL_LABELS[e]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span
                        className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          ESTADO_BADGE[a.estado] ?? 'text-muted-foreground bg-muted'
                        }`}
                      >
                        {ESTADO_ANIMAL_LABELS[a.estado] ?? a.estado}
                      </span>
                    ),
                },
                ...(puedeEscribir
                  ? [
                      {
                        header: 'Enfermería',
                        accessor: (a: Animal) => {
                          const adentro = a.idCorralEnfermeria != null
                          const muerto = a.estado === 'muerto'
                          return (
                            <button
                              onClick={() => handleEnfermeriaToggle(a)}
                              disabled={muerto}
                              title={
                                muerto
                                  ? 'Un animal muerto no puede moverse'
                                  : adentro
                                    ? 'Traer de enfermería'
                                    : 'Enviar a enfermería'
                              }
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                adentro
                                  ? 'text-warning bg-warning-soft hover:bg-warning hover:text-warning-foreground'
                                  : 'text-muted-foreground bg-muted hover:bg-primary-soft hover:text-primary'
                              }`}
                            >
                              {adentro ? <Undo2 className="size-3.5" strokeWidth={1.75} /> : <Stethoscope className="size-3.5" strokeWidth={1.75} />}
                              {adentro ? 'Traer' : 'Enviar'}
                            </button>
                          )
                        },
                      },
                      {
                        header: '',
                        accessor: (a: Animal) => (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setAnimalModal({ open: true, animal: a })}
                              title="Editar"
                              className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                            >
                              <Pencil className="size-4" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={() => handleAnimalDelete(a)}
                              title="Eliminar"
                              className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </section>
        </>
      ) : null}

      {animalModal.open && lote && (
        <AnimalModal
          animal={animalModal.animal}
          onClose={() => setAnimalModal({ open: false })}
          onOk={async (vals) => {
            await handleAnimalSave(vals)
            setAnimalModal({ open: false })
          }}
        />
      )}

      {enfPicker?.open && lote && (
        <EnfermeriaPickerModal
          onClose={() => setEnfPicker(null)}
          onOk={async (idCorral) => {
            if (enfPicker.animal) await enviarAEnfermeria(enfPicker.animal, idCorral)
            setEnfPicker(null)
          }}
        />
      )}
    </div>
  )
}

interface LoteFormSubmit {
  nombre: string
  fecha: string
  descripcion: string
  idCliente: string
  idCorral: string
  color: string
}

interface LoteFormProps {
  lote?: LoteDetalle
  clientes: Cliente[]
  corrals: CorralOpcion[]
  submitLabel: string
  readOnly?: boolean
  onSubmit: (vals: LoteFormSubmit) => Promise<void>
}

function LoteForm({ lote, clientes, corrals, submitLabel, readOnly, onSubmit }: LoteFormProps) {
  const [nombre, setNombre] = useState(lote?.nombre ?? '')
  const [fecha, setFecha] = useState(aInputDate(lote?.fecha))
  const [descripcion, setDescripcion] = useState(lote?.descripcion ?? '')
  const [idCliente, setIdCliente] = useState<string | number>(lote?.idCliente ?? '')
  const [idCorral, setIdCorral] = useState<string | number>(lote?.idCorral ?? '')
  const [color, setColor] = useState(lote?.color ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [mensaje, setMensaje] = useState('')

  // Comunes activos: libres, o ya ocupados por este lote.
  const corralsComunes = corrals.filter(
    (c) =>
      c.tipo === CORRAL_TIPOS.COMUN &&
      c.activo &&
      (c.estado === 'libre' || c.loteOcupante?.id === lote?.id),
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      setResult('error')
      setMensaje('El nombre del lote es obligatorio.')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      await onSubmit({
        nombre: nombre.trim(),
        fecha,
        descripcion,
        idCliente: String(idCliente),
        idCorral: String(idCorral),
        color,
      })
      setMensaje(lote ? 'Lote guardado correctamente.' : 'Lote creado.')
      setResult('ok')
    } catch (err) {
      console.error(err)
      setMensaje(extractMsg(err, 'No se pudo guardar el lote.'))
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  // Sólo lectura (cliente): resumen sin campos editables ni acciones.
  if (readOnly && lote) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <span
              className="size-4 rounded-full shrink-0 border border-border"
              style={{ backgroundColor: getLoteColor(lote.color) }}
              aria-hidden
            />
            {lote.nombre}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vista de sólo lectura.</p>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Fecha</dt>
            <dd className="text-foreground">{fmtFecha(lote.fecha)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Corral</dt>
            <dd className="text-foreground">{lote.corralNombre || 'Sin corral'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cliente (dueño)</dt>
            <dd className="text-foreground">{lote.nombreCliente || '—'}</dd>
          </div>
          {lote.descripcion && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Descripción</dt>
              <dd className="text-foreground whitespace-pre-wrap">{lote.descripcion}</dd>
            </div>
          )}
        </dl>
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {lote ? lote.nombre : 'Nuevo lote'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Datos generales de la partida.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="lote-nombre" className="text-sm font-medium text-foreground">Nombre *</label>
          <input
            id="lote-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            placeholder="Ej: Lote 1"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="lote-fecha" className="text-sm font-medium text-foreground">Fecha</label>
          <input
            id="lote-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <SelectAutocomplete
            label="Corral (común)"
            placeholder={corralsComunes.length === 0 ? 'Sin corrales comunes disponibles' : 'Seleccionar corral...'}
            value={idCorral}
            onChange={setIdCorral}
            options={corralsComunes.map((c) => ({ value: c.id, label: c.nombre }))}
            clearable
          />
          {corralsComunes.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Creá corrales comunes desde la sección Corrales.
            </p>
          )}
        </div>
        {clientes.length > 0 && (
          <div className="min-w-0">
            <SelectAutocomplete
              label="Cliente (dueño)"
              placeholder="Seleccionar cliente..."
              value={idCliente}
              onChange={setIdCliente}
              options={clientes.map((c) => ({ value: c.uid, label: c.nombreUsuario || c.email || c.uid }))}
              clearable
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">Color del lote</span>
        <div className="flex flex-wrap items-center gap-2">
          {PALETA_LOTE.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setColor(p === color ? '' : p)}
              className={`size-7 rounded-md border transition-all cursor-pointer ${
                color === p ? 'ring-2 ring-ring scale-110' : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: p }}
              aria-label={`Color ${p}`}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {color ? 'Seleccionado' : 'Auto (se asigna un color de la paleta)'}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="lote-descripcion" className="text-sm font-medium text-foreground">Descripción</label>
        <textarea
          id="lote-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Observaciones generales de la partida"
          className={`${inputCls} resize-y`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" strokeWidth={2} />}
          {busy ? 'Guardando…' : submitLabel}
        </button>
        {result === 'ok' && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="size-4" strokeWidth={2} /> {mensaje}
          </span>
        )}
        {result === 'error' && (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="size-4" strokeWidth={2} /> {mensaje}
          </span>
        )}
      </div>
    </form>
  )
}

/** Picker cuando la empresa tiene más de una enfermería activa. */
function EnfermeriaPickerModal({
  onClose,
  onOk,
}: {
  onClose: () => void
  onOk: (idCorral: number) => Promise<void>
}) {
  const { data: enfermerias } = useSWR<{ id: number; nombre: string }[]>(
    '/corrales/enfermerias',
    fetcher,
  )
  const [sel, setSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!sel) {
      setError('Elegí un corral de enfermería.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onOk(Number(sel))
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo enviar a enfermería.'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Enviar a enfermería</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <SelectAutocomplete
          label="Corral de enfermería"
          placeholder="Seleccionar..."
          value={sel}
          onChange={(v) => setSel(String(v))}
          options={(enfermerias || []).map((e) => ({ value: e.id, label: e.nombre }))}
        />
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
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Stethoscope className="size-4" strokeWidth={2} />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

interface AnimalFormValues {
  nAnimal?: number
  sexo?: string
  pelaje?: string
  fechaPesajeIni?: string
  pesoInicial?: number
  desbasteIni?: number
  fechaPesajeFin?: string
  pesoFinal?: number
  desbasteFin?: number
  observaciones?: string
}

function AnimalModal({
  animal,
  onClose,
  onOk,
}: {
  animal?: Animal
  onClose: () => void
  onOk: (vals: AnimalFormValues) => Promise<void>
}) {
  const [nAnimal, setNAnimal] = useState(animal?.nAnimal?.toString() ?? '')
  const [sexo, setSexo] = useState(animal?.sexo ?? '')
  const [pelaje, setPelaje] = useState(animal?.pelaje ?? '')
  const [fechaPesajeIni, setFechaPesajeIni] = useState(aInputDate(animal?.fechaPesajeIni))
  const [pesoInicial, setPesoInicial] = useState(animal?.pesoInicial?.toString() ?? '')
  const [desbasteIni, setDesbasteIni] = useState(animal?.desbasteIni?.toString() ?? '')
  const [fechaPesajeFin, setFechaPesajeFin] = useState(aInputDate(animal?.fechaPesajeFin))
  const [pesoFinal, setPesoFinal] = useState(animal?.pesoFinal?.toString() ?? '')
  const [desbasteFin, setDesbasteFin] = useState(animal?.desbasteFin?.toString() ?? '')
  const [observaciones, setObservaciones] = useState(animal?.observaciones ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toNum = (s: string): number | undefined => {
    const n = parseFloat(s.replace(',', '.'))
    return isNaN(n) ? undefined : n
  }

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      await onOk({
        nAnimal: nAnimal.trim() ? parseInt(nAnimal, 10) : undefined,
        sexo: sexo || undefined,
        pelaje: pelaje.trim() || undefined,
        fechaPesajeIni: fechaPesajeIni || undefined,
        pesoInicial: pesoInicial.trim() ? toNum(pesoInicial) : undefined,
        desbasteIni: desbasteIni.trim() ? toNum(desbasteIni) : undefined,
        fechaPesajeFin: fechaPesajeFin || undefined,
        pesoFinal: pesoFinal.trim() ? toNum(pesoFinal) : undefined,
        desbasteFin: desbasteFin.trim() ? toNum(desbasteFin) : undefined,
        observaciones: observaciones.trim() || undefined,
      })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el animal.'))
      setBusy(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {animal ? `Editar animal ${animal.nAnimal ?? ''}` : 'Agregar animal'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Campos según la planilla de pesaje. El server calcula peso neto, diferencia y aumento diario.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">N° animal</label>
            <input type="number" value={nAnimal} onChange={(e) => setNAnimal(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Sexo</label>
            <select value={sexo} onChange={(e) => setSexo(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">—</option>
              <option value="MACHO">Macho</option>
              <option value="HEMBRA">Hembra</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Pelaje</label>
            <input type="text" value={pelaje} onChange={(e) => setPelaje(e.target.value)} className={inputCls} placeholder="Ej: Colorado" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Fecha pesaje inicial</label>
            <input type="date" value={fechaPesajeIni} onChange={(e) => setFechaPesajeIni(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Peso inicial (kg)</label>
            <input type="number" step="0.01" value={pesoInicial} onChange={(e) => setPesoInicial(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Desbaste inicial</label>
            <input type="number" step="0.01" value={desbasteIni} onChange={(e) => setDesbasteIni(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Fecha pesaje final</label>
            <input type="date" value={fechaPesajeFin} onChange={(e) => setFechaPesajeFin(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Peso final (kg)</label>
            <input type="number" step="0.01" value={pesoFinal} onChange={(e) => setPesoFinal(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Desbaste final</label>
            <input type="number" step="0.01" value={desbasteFin} onChange={(e) => setDesbasteFin(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" strokeWidth={2} />}
            {animal ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
