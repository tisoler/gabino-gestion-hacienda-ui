import { useMemo, useState } from 'react'
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
  History,
  Stethoscope,
  Undo2,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { useVolver } from '../lib/navegacion'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import CatalogoSelect, { type CatalogoItem } from '../components/CatalogoSelect'
import {
  CategoriaSelect,
  PelajeSelect,
  SexoDeCategoria,
} from '../components/AnimalCatalogos'
import { pelajeAptoParaRaza } from '../lib/catalogos'
import { CargaMasivaModal, type CargaMasivaValues } from '../components/CargaMasivaModal'
import {
  CambioEstadoModal,
  EnviarEnfermeriaModal,
  MovimientosModal,
  TraerEnfermeriaModal,
  type EnfermeriaOpcion,
} from '../components/AnimalModals'
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
  caravana: string | null
  sexo: string | null
  idPelaje: number | null
  pelajeNombre: string | null
  idRaza: number | null
  razaNombre: string | null
  idCategoria: number | null
  categoriaNombre: string | null
  categoriaSexo: string | null
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
  idProveedor: number | null
  nombreProveedor: string | null
  idLugarOrigen: number | null
  nombreLugarOrigen: string | null
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
  lotesOcupantes: { id: number; nombre: string; color: string | null }[]
  nAnimales: number
}

interface Cliente {
  uid: string
  nombreUsuario: string | null
  email: string | null
  rol: string | null
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

  // El picker de titulares (clientes + anfitrión) requiere lectura:cliente
  // (anfitrión/sys-admin); el operario crea lotes sin dueño.
  const puedeVerClientes = permisos.includes('lectura:cliente')
  const { data: clientes } = useSWR<Cliente[]>(
    puedeVerClientes ? '/clientes/titulares' : null,
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
  const [masivaModal, setMasivaModal] = useState(false)
  const [enviarModal, setEnviarModal] = useState<{ animal: Animal; enfermerias: EnfermeriaOpcion[] } | null>(null)
  const [traerModal, setTraerModal] = useState<Animal | null>(null)
  const [estadoModal, setEstadoModal] = useState<{ animal: Animal; estado: string } | null>(null)
  const [movModal, setMovModal] = useState<Animal | null>(null)
  const [error, setError] = useState('')

  const labelAnimal = (a: Animal) => `Animal ${a.nAnimal ?? a.id}`

  // Próximo N° de animal: el último del lote + 1 (para precargar en los alta).
  const siguienteN = useMemo(() => {
    const nums = (lote?.animales ?? [])
      .map((a) => a.nAnimal)
      .filter((x): x is number => x != null)
    return nums.length ? Math.max(...nums) + 1 : 1
  }, [lote])

  const handleCrearLote = async (vals: LoteFormSubmit) => {
    const { data } = await api.post<{ id: number }>('/lotes', {
      nombre: vals.nombre,
      fecha: vals.fecha || undefined,
      descripcion: vals.descripcion || undefined,
      idCliente: vals.idCliente || undefined,
      idProveedor: vals.idProveedor ? Number(vals.idProveedor) : undefined,
      idLugarOrigen: vals.idLugarOrigen ? Number(vals.idLugarOrigen) : undefined,
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
      idProveedor: vals.idProveedor ? Number(vals.idProveedor) : null,
      idLugarOrigen: vals.idLugarOrigen ? Number(vals.idLugarOrigen) : null,
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

  const handleMasivaSave = async (vals: CargaMasivaValues) => {
    if (!lote) return
    await api.post(`/lotes/${lote.id}/animales/masiva`, vals)
    setMasivaModal(false)
    await mutateLote()
  }

  const handleAnimalDelete = async (a: Animal) => {
    if (!lote) return
    if (!window.confirm(`¿Eliminar el animal ${a.nAnimal ?? a.id}?`)) return
    await api.delete(`/lotes/${lote.id}/animales/${a.id}`)
    await mutateLote()
  }

  /** Toggle de estado: a enfermo/muerto pide la causa (modal). */
  const handleEstado = async (a: Animal, estado: string) => {
    if (!lote || a.estado === estado) return
    setError('')
    if (estado === 'enfermo' || estado === 'muerto') {
      setEstadoModal({ animal: a, estado })
      return
    }
    try {
      await aplicarEstado(a, estado)
    } catch {
      /* el error ya se mostró en el banner */
    }
  }

  const aplicarEstado = async (a: Animal, estado: string, motivoId?: number) => {
    if (!lote) return
    try {
      await api.patch(`/lotes/${lote.id}/animales/${a.id}`, {
        estado,
        ...(motivoId ? { idMotivo: motivoId } : {}),
      })
      await mutateLote()
      await mutate('/corrales/mapa')
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo actualizar el estado.'))
      throw err
    }
  }

  const handleEnfermeria = async (
    a: Animal,
    motivoId: number,
    idCorral?: number,
  ) => {
    if (!lote) return
    try {
      await api.post(`/lotes/${lote.id}/animales/${a.id}/enfermeria`, {
        idMotivo: motivoId,
        ...(idCorral ? { idCorral } : {}),
      })
      setEnviarModal(null)
      await mutateLote()
      await mutate('/corrales/mapa')
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo enviar a enfermería.'))
      throw err
    }
  }

  const handleTraer = async (
    a: Animal,
    estado: 'sano' | 'muerto',
    motivoId?: number,
  ) => {
    if (!lote) return
    try {
      await api.delete(`/lotes/${lote.id}/animales/${a.id}/enfermeria`, {
        data: { estado, ...(motivoId ? { idMotivo: motivoId } : {}) },
      })
      setTraerModal(null)
      await mutateLote()
      await mutate('/corrales/mapa')
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo traer de enfermería.'))
      throw err
    }
  }

  /** Toggle enfermería: enviar (motivo obligatorio) o traer (estado de salida). */
  const handleEnfermeriaToggle = async (a: Animal) => {
    if (!lote) return
    setError('')
    if (a.idCorralEnfermeria != null) {
      setTraerModal(a)
      return
    }
    try {
      const { data } = await api.get<EnfermeriaOpcion[]>('/corrales/enfermerias')
      if (data.length === 0) {
        setError('No hay un corral de enfermería activo en la empresa. Creá uno en Corrales.')
        return
      }
      setEnviarModal({ animal: a, enfermerias: data })
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMasivaModal(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus className="size-4" strokeWidth={2} /> Carga masiva
                  </button>
                  <button
                    onClick={() => setAnimalModal({ open: true })}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus className="size-4" strokeWidth={2} /> Agregar animal
                  </button>
                </div>
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
                { header: 'Caravana', accessor: (a) => <span className="font-medium text-foreground">{a.caravana || '—'}</span> },
                { header: 'Sexo', accessor: (a) => <span className="text-muted-foreground">{a.sexo === 'MACHO' ? 'Macho' : a.sexo === 'HEMBRA' ? 'Hembra' : '—'}</span> },
                { header: 'Pelaje', accessor: (a) => <span className="text-muted-foreground">{a.pelajeNombre || '—'}</span> },
                { header: 'Raza', accessor: (a) => <span className="text-muted-foreground">{a.razaNombre || '—'}</span> },
                { header: 'Categoría', accessor: (a) => <span className="text-muted-foreground">{a.categoriaNombre || '—'}</span> },
                { header: 'Peso ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoInicial)}</span> },
                { header: 'Neto ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoIni)}</span> },
                { header: 'Peso fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoFinal)}</span> },
                { header: 'Neto fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoFin)}</span> },
                { header: 'Diferencia', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.diferencia)}</span> },
                { header: 'Aum. diario', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.aumDiario, 4)}</span> },
                {
                  header: 'Estado',
                  accessor: (a) => (
                    <div className="flex items-center gap-1.5">
                      {puedeEscribir ? (
                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                          {ESTADOS_ANIMAL.map((e) => (
                            <button
                              key={e}
                              onClick={() => handleEstado(a, e)}
                              title={ESTADO_ANIMAL_LABELS[e]}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${a.estado === e
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
                          className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${ESTADO_BADGE[a.estado] ?? 'text-muted-foreground bg-muted'
                            }`}
                        >
                          {ESTADO_ANIMAL_LABELS[a.estado] ?? a.estado}
                        </span>
                      )}
                      <button
                        onClick={() => setMovModal(a)}
                        title="Ver movimientos del animal"
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                      >
                        <History className="size-4" strokeWidth={1.75} />
                      </button>
                    </div>
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
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${adentro
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
          siguienteN={siguienteN}
          onClose={() => setAnimalModal({ open: false })}
          onOk={async (vals) => {
            await handleAnimalSave(vals)
            setAnimalModal({ open: false })
          }}
        />
      )}

      {masivaModal && lote && (
        <CargaMasivaModal
          siguienteN={siguienteN}
          onClose={() => setMasivaModal(false)}
          onOk={handleMasivaSave}
        />
      )}

      {enviarModal && (
        <EnviarEnfermeriaModal
          animalLabel={labelAnimal(enviarModal.animal)}
          enfermerias={enviarModal.enfermerias}
          onClose={() => setEnviarModal(null)}
          onOk={async (motivoId, idCorral) => {
            await handleEnfermeria(enviarModal.animal, motivoId, idCorral)
          }}
        />
      )}

      {traerModal && (
        <TraerEnfermeriaModal
          animalLabel={labelAnimal(traerModal)}
          onClose={() => setTraerModal(null)}
          onOk={async (estado, motivoId) => {
            await handleTraer(traerModal, estado, motivoId)
          }}
        />
      )}

      {estadoModal && (
        <CambioEstadoModal
          animalLabel={labelAnimal(estadoModal.animal)}
          estado={estadoModal.estado}
          onClose={() => setEstadoModal(null)}
          onOk={async (motivoId) => {
            await aplicarEstado(estadoModal.animal, estadoModal.estado, motivoId)
            setEstadoModal(null)
          }}
        />
      )}

      {movModal && lote && (
        <MovimientosModal
          loteId={lote.id}
          animal={{ id: movModal.id, nAnimal: movModal.nAnimal }}
          onClose={() => setMovModal(null)}
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
  idProveedor: string
  idLugarOrigen: string
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
  const [idProveedor, setIdProveedor] = useState<string | number>(lote?.idProveedor ?? '')
  const [idLugarOrigen, setIdLugarOrigen] = useState<string | number>(lote?.idLugarOrigen ?? '')
  const [idCorral, setIdCorral] = useState<string | number>(lote?.idCorral ?? '')
  const [color, setColor] = useState(lote?.color ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [mensaje, setMensaje] = useState('')

  const rolByUid = new Map<string, string | null>(
    clientes.map((c) => [c.uid, c.rol]),
  )

  // Comunes activos: un corral puede compartirse con más de un lote, así que
  // todos están disponibles (se muestra cuántos animales hay adentro).
  const corralsComunes = corrals.filter(
    (c) => c.tipo === CORRAL_TIPOS.COMUN && c.activo,
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
        idProveedor: String(idProveedor),
        idLugarOrigen: String(idLugarOrigen),
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
            <dt className="text-muted-foreground">Titular (cliente/anfitrión)</dt>
            <dd className="text-foreground">{lote.nombreCliente || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Proveedor</dt>
            <dd className="text-foreground">{lote.nombreProveedor || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lugar de origen</dt>
            <dd className="text-foreground">{lote.nombreLugarOrigen || '—'}</dd>
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
            renderTag={(o) => {
              const c = corralsComunes.find((x) => x.id === o.value)
              if (!c || c.lotesOcupantes.length === 0) return null
              return (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  {c.lotesOcupantes.length} lote{c.lotesOcupantes.length > 1 ? 's' : ''} · {c.nAnimales}
                </span>
              )
            }}
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
              label="Titular (cliente o anfitrión)"
              placeholder="Seleccionar titular..."
              value={idCliente}
              onChange={setIdCliente}
              options={clientes.map((c) => ({ value: c.uid, label: c.nombreUsuario || c.email || c.uid }))}
              clearable
              renderTag={(o) =>
                rolByUid.get(String(o.value)) === 'anfitrion' ? (
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-primary bg-primary-soft rounded-full px-1.5 py-0.5">
                    Anfitrión
                  </span>
                ) : null
              }
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CatalogoSelect
          tipo="proveedor"
          label="Proveedor"
          placeholder="Buscar o agregar proveedor..."
          value={idProveedor}
          onChange={setIdProveedor}
        />
        <CatalogoSelect
          tipo="lugar_origen"
          label="Lugar de origen"
          placeholder="Buscar o agregar lugar..."
          value={idLugarOrigen}
          onChange={setIdLugarOrigen}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">Color del lote</span>
        <div className="flex flex-wrap items-center gap-2">
          {PALETA_LOTE.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setColor(p === color ? '' : p)}
              className={`size-7 rounded-md border transition-all cursor-pointer ${color === p ? 'ring-2 ring-ring scale-110' : 'border-border hover:scale-105'
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

interface AnimalFormValues {
  nAnimal?: number
  caravana: string
  idPelaje: number
  idRaza?: number | null
  idCategoria?: number | null
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
  siguienteN,
  onClose,
  onOk,
}: {
  animal?: Animal
  siguienteN: number
  onClose: () => void
  onOk: (vals: AnimalFormValues) => Promise<void>
}) {
  const [nAnimal, setNAnimal] = useState(
    animal?.nAnimal?.toString() ?? String(siguienteN),
  )
  const [caravana, setCaravana] = useState(animal?.caravana ?? '')
  const [idRaza, setIdRaza] = useState<string | number>(animal?.idRaza ?? '')
  const [idCategoria, setIdCategoria] = useState<string | number>(animal?.idCategoria ?? '')
  const [idPelaje, setIdPelaje] = useState<string | number>(animal?.idPelaje ?? '')
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

  // Al cambiar la raza, si el pelaje elegido no aplica, se limpia.
  const { data: pelajes } = useSWR<CatalogoItem[]>('/catalogos/pelaje', fetcher, {
    revalidateOnFocus: false,
  })
  const cambiarRaza = (v: string | number) => {
    setIdRaza(v)
    if (idPelaje && pelajes) {
      const p = pelajes.find((x) => x.id === Number(idPelaje))
      if (p && !pelajeAptoParaRaza(p, v)) setIdPelaje('')
    }
  }

  const submit = async () => {
    setError('')
    if (!caravana.trim()) {
      setError('La caravana es obligatoria.')
      return
    }
    if (!idPelaje) {
      setError('El pelaje es obligatorio.')
      return
    }
    setBusy(true)
    try {
      await onOk({
        nAnimal: nAnimal.trim() ? parseInt(nAnimal, 10) : undefined,
        caravana: caravana.trim(),
        idPelaje: Number(idPelaje),
        idRaza: idRaza === '' ? null : Number(idRaza),
        idCategoria: idCategoria === '' ? null : Number(idCategoria),
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">N° animal</label>
            <input type="number" value={nAnimal} onChange={(e) => setNAnimal(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Caravana *</label>
            <input
              type="text"
              value={caravana}
              onChange={(e) => setCaravana(e.target.value)}
              className={inputCls}
              placeholder="Ej: 1234"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <CatalogoSelect
            tipo="raza"
            label="Raza"
            placeholder="Buscar o agregar raza..."
            value={idRaza}
            onChange={cambiarRaza}
          />
          <div className="flex items-end gap-2">
            <CategoriaSelect value={idCategoria} onChange={setIdCategoria} className="flex-1" />
            <SexoDeCategoria idCategoria={idCategoria} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PelajeSelect value={idPelaje} onChange={setIdPelaje} idRaza={idRaza} />
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
