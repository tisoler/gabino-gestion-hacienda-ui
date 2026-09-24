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
  Scale,
  TrendingUp,
  ChevronDown,
  Flag,
  Utensils,
  LogOut,
  Wand2,
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
import { EdicionMasivaModal, type EdicionMasivaValues } from '../components/EdicionMasivaModal'
import { EditorPesos, type EditorAnimalRow } from '../components/EditorPesos'
import { GrupoInicial } from '../components/GrupoInicial'
import { PesajeLotePartidaModal, type FilaLotePartida } from '../components/PesajeLotePartidaModal'
import { PesajeFinalModal } from '../components/PesajeFinalModal'
import { EvolucionPesos } from '../components/EvolucionPesos'
import { SalidaModal } from '../components/SalidaModal'
import {
  fechaBase,
  fechasIntermedias,
  fechasFinales,
  fmtFechaCorta,
  fmtPeso,
  totalPorFecha,
  diffDias,
  type CargarPesajesPayload,
  type PartidaDto,
  type PesajeDto,
} from '../lib/pesos'
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
  idPartida: number | null
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
  pesajes: PesajeDto[]
  partidas: PartidaDto[]
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
  salido: 'text-primary bg-primary-soft',
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
  const puedeVerAlimento = permisos.includes('lectura:alimento')
  const puedeDarSalida = permisos.includes('escritura:salida')
  const puedeVerSalidas = permisos.includes('lectura:salida')

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
  const [edicionMasivaModal, setEdicionMasivaModal] = useState(false)
  const [enviarModal, setEnviarModal] = useState<{ animal: Animal; enfermerias: EnfermeriaOpcion[] } | null>(null)
  const [traerModal, setTraerModal] = useState<Animal | null>(null)
  const [estadoModal, setEstadoModal] = useState<{ animal: Animal; estado: string } | null>(null)
  const [movModal, setMovModal] = useState<Animal | null>(null)
  const [inicialModal, setInicialModal] = useState<{ editar: boolean; idPartida: number | null } | null>(null)
  const [intermedioModal, setIntermedioModal] = useState<{ fecha: string | null } | null>(null)
  const [pesajeBusy, setPesajeBusy] = useState(false)
  const [finalModal, setFinalModal] = useState(false)
  const [editandoFinalFecha, setEditandoFinalFecha] = useState<string | null>(null)
  const [finalEditBusy, setFinalEditBusy] = useState(false)
  const [evolucionAbierta, setEvolucionAbierta] = useState(false)
  const [salidaModal, setSalidaModal] = useState(false)
  const [error, setError] = useState('')

  const labelAnimal = (a: Animal) =>
    a.caravana ? `Car. ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`

  // Próximo N° de animal: el último del lote + 1 (para precargar en los alta).
  const siguienteN = useMemo(() => {
    const nums = (lote?.animales ?? [])
      .map((a) => a.nAnimal)
      .filter((x): x is number => x != null)
    return nums.length ? Math.max(...nums) + 1 : 1
  }, [lote])

  // --- Pesajes ---
  const pesajes = useMemo(() => lote?.pesajes ?? [], [lote])
  const partidas = useMemo(() => lote?.partidas ?? [], [lote])
  const baseFecha = useMemo(() => fechaBase(pesajes) ?? lote?.fecha ?? null, [pesajes, lote])
  const intermedias = useMemo(() => fechasIntermedias(pesajes), [pesajes])
  const finales = useMemo(() => fechasFinales(pesajes), [pesajes])
  // Tabla de animales: caravana ascendente (orden natural).
  const animalesOrdenados = useMemo(
    () =>
      [...(lote?.animales ?? [])].sort((a, b) => {
        const ca = a.caravana ?? ''
        const cb = b.caravana ?? ''
        if (!ca && cb) return 1
        if (ca && !cb) return -1
        const cmp = ca.localeCompare(cb, 'es', { numeric: true })
        if (cmp !== 0) return cmp
        const na = a.nAnimal ?? Number.MAX_SAFE_INTEGER
        const nb = b.nAnimal ?? Number.MAX_SAFE_INTEGER
        return na - nb || a.id - b.id
      }),
    [lote],
  )
  // Mapa (animalId, fecha) → pesaje para las celdas intermedias.
  const pesajePorAnimalFecha = useMemo(() => {
    const m = new Map<string, PesajeDto>()
    for (const p of pesajes) if (p.tipo === 'intermedio') m.set(`${p.animalId}|${p.fecha}`, p)
    return m
  }, [pesajes])
  // Pesaje 'final' por animal (para prellenar su editor).
  const pesajeFinalPorAnimal = useMemo(() => {
    const m = new Map<number, PesajeDto>()
    for (const p of pesajes) if (p.tipo === 'final') m.set(p.animalId, p)
    return m
  }, [pesajes])
  // Pesaje 'inicial' por animal.
  const pesajeInicialPorAnimal = useMemo(() => {
    const m = new Map<number, PesajeDto>()
    for (const p of pesajes) if (p.tipo === 'inicial') m.set(p.animalId, p)
    return m
  }, [pesajes])
  // Animales pesados en cada fila (intermedio por fecha / final).
  const nPesadosFecha = (fecha: string) =>
    pesajes.filter((p) => p.tipo === 'intermedio' && p.fecha === fecha).length

  // Animales VIVOS (sano/enfermo) para los editores de peso: muertos y salidos
  // no se pesan (los salidos conservan su peso registrado en la salida).
  const esVivo = (a: Animal) => a.estado === 'sano' || a.estado === 'enfermo'
  const animalesEditor: EditorAnimalRow[] = useMemo(
    () =>
      (lote?.animales ?? [])
        .filter(esVivo)
        .map((a) => ({
          id: a.id,
          nAnimal: a.nAnimal,
          caravana: a.caravana,
          pesoActual: a.pesoInicial,
        })),
    [lote],
  )

  // Animales vivos sin pesaje final (los "restantes" para el botón Pesaje final).
  const animalesSinFinal = useMemo(
    () => animalesEditor.filter((a) => !pesajeFinalPorAnimal.has(a.id)),
    [animalesEditor, pesajeFinalPorAnimal],
  )
  // Con idPartida, para el alcance por partida del pesaje final.
  const animalesSinFinalEditor = useMemo(
    () =>
      (lote?.animales ?? [])
        .filter((a) => esVivo(a) && !pesajeFinalPorAnimal.has(a.id))
        .map((a) => ({
          id: a.id,
          nAnimal: a.nAnimal,
          caravana: a.caravana,
          pesoActual: null,
          idPartida: a.idPartida,
        })),
    [lote, pesajeFinalPorAnimal],
  )

  // Filas del editor del pesaje final de una fecha (incluye salidos: tienen su
  // final registrado y se pueden corregir).
  const filasFinalDe = (fecha: string): EditorAnimalRow[] =>
    (lote?.animales ?? [])
      .filter((a) => pesajeFinalPorAnimal.get(a.id)?.fecha === fecha)
      .map((a) => ({
        id: a.id,
        nAnimal: a.nAnimal,
        caravana: a.caravana,
        pesoActual: pesajeFinalPorAnimal.get(a.id)?.peso ?? null,
      }))
  const totalFinalDe = (fecha: string): number =>
    pesajes
      .filter((p) => p.tipo === 'final' && p.fecha === fecha)
      .reduce((acc, p) => acc + Number(p.peso), 0)

  // Animales vivos SIN pesaje inicial (para el botón "+ Pesaje inicial").
  const animalesSinInicial = useMemo(
    () => (lote?.animales ?? []).filter((a) => esVivo(a) && !pesajeInicialPorAnimal.has(a.id)),
    [lote, pesajeInicialPorAnimal],
  )

  const aFilaLP = (
    a: Animal,
    pesoActual: number | null,
    desbasteActual: number | null,
  ): FilaLotePartida => ({
    id: a.id,
    nAnimal: a.nAnimal,
    caravana: a.caravana,
    idPartida: a.idPartida,
    pesoActual,
    desbasteActual,
  })

  // Nuevo intermedio: todos los vivos del alcance (pesoActual null).
  const filasVivosFila = (): FilaLotePartida[] =>
    (lote?.animales ?? []).filter(esVivo).map((a) => aFilaLP(a, null, null))

  // Editar intermedio de una fecha: vivos + los que tienen pesaje en esa fecha
  // (incluidos salidos), prefilled.
  const filasIntermedioFecha = (fecha: string): FilaLotePartida[] => {
    const conPesaje = new Set(
      pesajes.filter((p) => p.tipo === 'intermedio' && p.fecha === fecha).map((p) => p.animalId),
    )
    return (lote?.animales ?? [])
      .filter((a) => esVivo(a) || conPesaje.has(a.id))
      .map((a) => {
        const p = pesajePorAnimalFecha.get(`${a.id}|${fecha}`)
        return aFilaLP(a, p?.peso ?? null, p?.desbaste ?? null)
      })
  }

  // Nuevo inicial: sólo los que faltan (vivos sin inicial).
  const filasInicialFaltantesFila = (): FilaLotePartida[] =>
    animalesSinInicial.map((a) => aFilaLP(a, null, null))

  // Una fila de pesaje inicial por PARTIDA (el badge depende de la partida, no
  // de la fecha: dos partidas pueden compartir fecha).
  // Filas del editor del inicial de una partida (vivos + con inicial, incluidos
  // salidos), prefilled.
  const filasInicialFila = (idPartida: number): FilaLotePartida[] =>
    (lote?.animales ?? [])
      .filter((a) => a.idPartida === idPartida)
      .filter((a) => esVivo(a) || pesajeInicialPorAnimal.has(a.id))
      .map((a) => {
        const p = pesajeInicialPorAnimal.get(a.id)
        return aFilaLP(a, p?.peso ?? null, p?.desbaste ?? null)
      })
  // Fecha del pesaje inicial de una partida (mín de sus 'inicial').
  const fechaInicialDe = (idPartida: number): string | null => {
    const fs = (lote?.animales ?? [])
      .filter((a) => a.idPartida === idPartida)
      .map((a) => pesajeInicialPorAnimal.get(a.id)?.fecha)
      .filter((f): f is string => !!f)
      .sort()
    return fs.length ? fs[0] : null
  }
  // Última fecha de pesaje inicial del lote (para precargar un inicial nuevo).
  const ultimaFechaInicial = useMemo(() => {
    const fs = pesajes.filter((p) => p.tipo === 'inicial').map((p) => p.fecha).sort()
    return fs.length ? fs[fs.length - 1] : null
  }, [pesajes])

  /** Nuevo o edición de un pesaje intermedio (fecha null = nuevo). */
  const onIntermedioOk = async (fechaOriginal: string | null, payload: CargarPesajesPayload) => {
    if (!lote) return
    setPesajeBusy(true)
    try {
      if (fechaOriginal && payload.fecha !== fechaOriginal) {
        await api.delete(`/lotes/${lote.id}/pesajes/intermedios/${fechaOriginal}`)
      }
      await api.post(`/lotes/${lote.id}/pesajes/intermedios`, payload)
      await mutateLote()
      await mutate('/lotes')
      setIntermedioModal(null)
    } finally {
      setPesajeBusy(false)
    }
  }

  /** Nuevo (faltantes) o edición de un pesaje inicial. */
  const onInicialOk = async (payload: CargarPesajesPayload) => {
    if (!lote) return
    setPesajeBusy(true)
    try {
      await api.post(`/lotes/${lote.id}/pesajes/inicial`, payload)
      await mutateLote()
      await mutate('/lotes')
      setInicialModal(null)
    } finally {
      setPesajeBusy(false)
    }
  }

  const eliminarIntermedio = async (fecha: string) => {
    if (!lote) return
    if (!window.confirm(`¿Eliminar el pesaje intermedio del ${fmtFechaCorta(fecha)} para todo el lote?`)) return
    try {
      await api.delete(`/lotes/${lote.id}/pesajes/intermedios/${fecha}`)
      await mutateLote()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo eliminar el pesaje.'))
    }
  }

  /** Alta del pesaje final (alcance lote/partida/animales). */
  const agregarFinal = async (payload: CargarPesajesPayload) => {
    if (!lote) return
    await api.post(`/lotes/${lote.id}/pesajes/final`, payload)
    await mutateLote()
    setFinalModal(false)
  }

  /** Guarda la edición inline de un pesaje final (por fecha). */
  const guardarFinalEdit = async (payload: CargarPesajesPayload) => {
    if (!lote) return
    setFinalEditBusy(true)
    setError('')
    try {
      await api.post(`/lotes/${lote.id}/pesajes/final`, payload)
      await mutateLote()
      setEditandoFinalFecha(null)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el pesaje final.'))
    } finally {
      setFinalEditBusy(false)
    }
  }

  const eliminarFinal = async (fecha: string) => {
    if (!lote) return
    if (!window.confirm(`¿Eliminar el pesaje final del ${fmtFechaCorta(fecha)}?`)) return
    try {
      await api.delete(`/lotes/${lote.id}/pesajes/final/${fecha}`)
      await mutateLote()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo eliminar el pesaje final.'))
    }
  }

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

  const handleEdicionMasivaSave = async (vals: EdicionMasivaValues) => {
    if (!lote) return
    await api.post(`/lotes/${lote.id}/animales/edicion-masiva`, vals)
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

  const aplicarEstado = async (
    a: Animal,
    estado: string,
    motivoId?: number,
    fecha?: string,
    hora?: string,
  ) => {
    if (!lote) return
    try {
      await api.patch(`/lotes/${lote.id}/animales/${a.id}`, {
        estado,
        ...(motivoId ? { idMotivo: motivoId } : {}),
        ...(fecha ? { fecha } : {}),
        ...(hora ? { hora } : {}),
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
    idCorral: number | undefined,
    fecha: string,
    hora: string,
  ) => {
    if (!lote) return
    try {
      await api.post(`/lotes/${lote.id}/animales/${a.id}/enfermeria`, {
        idMotivo: motivoId,
        fecha,
        hora,
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
    motivoId: number | undefined,
    fecha: string,
    hora: string,
  ) => {
    if (!lote) return
    try {
      await api.delete(`/lotes/${lote.id}/animales/${a.id}/enfermeria`, {
        data: { estado, fecha, hora, ...(motivoId ? { idMotivo: motivoId } : {}) },
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
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={volver}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" strokeWidth={2} /> Volver a lotes
        </button>
      </div>

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
          submitLabel="Agregar lote"
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
            headerExtra={
              (puedeVerSalidas || puedeVerAlimento) ? (
                <div className="flex items-center gap-2">
                  {puedeVerAlimento && (
                    <button
                      onClick={() => navigate(`/alimentacion?lote=${lote.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                    >
                      <Utensils className="size-4" strokeWidth={2} /> Alimentación del lote
                    </button>
                  )}
                  {puedeVerSalidas && (
                    <button
                      onClick={() => navigate(`/salidas?lote=${lote.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                    >
                      <LogOut className="size-4" strokeWidth={2} /> Salidas del lote
                    </button>
                  )}
                </div>
              ) : undefined
            }
          />

          {/* Pesajes: peso inicial + intermedios + evolución (misma sección) */}
          <section className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <Scale className="size-5" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Pesajes</p>
                  <p className="text-xs text-muted-foreground">
                    {lote.animales.length} animales
                  </p>
                </div>
              </div>
              {puedeEscribir && (
                <div className="grid grid-cols-2 gap-2 [&>button]:justify-center sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                  {animalesSinInicial.length > 0 && (
                    <button
                      onClick={() => setInicialModal({ editar: false, idPartida: null })}
                      title={`Cargar el peso inicial de los ${animalesSinInicial.length} animales que faltan`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-info/40 text-white bg-info hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <Plus className="size-4" strokeWidth={2} /> Pesaje inicial
                    </button>
                  )}
                  <button
                    onClick={() => setIntermedioModal({ fecha: null })}
                    disabled={lote.animales.length === 0}
                    title={lote.animales.length === 0 ? 'Agregá animales primero' : 'Agregar pesaje intermedio'}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="size-4" strokeWidth={2} /> Pesaje intermedio
                  </button>
                  {animalesSinFinal.length > 0 && (
                    <button
                      onClick={() => setFinalModal(true)}
                      disabled={animalesSinFinal.length === 0}
                      title={
                        animalesSinFinal.length === 0
                          ? 'No hay animales sin pesaje final'
                          : `Pesaje final de los ${animalesSinFinal.length} animales restantes`
                      }
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-success/40 text-white bg-success hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      <Flag className="size-4" strokeWidth={2} /> Pesaje final
                    </button>
                  )}
                  {puedeDarSalida && (
                    <button
                      onClick={() => setSalidaModal(true)}
                      disabled={lote.animales.length === 0}
                      title={lote.animales.length === 0 ? 'Agregá animales primero' : 'Dar salida a animales'}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-destructive/40 text-white bg-destructive hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      <LogOut className="size-4" strokeWidth={2} /> Dar salida
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pesajes: peso inicial (por partida si hay varias) + intermedios (lote) */}
            <div className="border border-border rounded-md divide-y divide-border">
              {partidas.length === 0 ? (
                <GrupoInicial
                  titulo="Peso inicial"
                  badge="Lote"
                  animales={animalesEditor}
                  puedeEscribir={puedeEscribir}
                  onEditar={() => setInicialModal({ editar: false, idPartida: null })}
                />
              ) : (
                partidas.map((p) => {
                  const fIni = fechaInicialDe(p.id) ?? p.fecha ?? null
                  return (
                    <GrupoInicial
                      key={p.id}
                      titulo={fIni ? `Pesaje ${fmtFechaCorta(fIni)}` : p.nombre}
                      badge={partidas.length > 1 ? p.nombre : 'Lote'}
                      animales={filasInicialFila(p.id)}
                      puedeEscribir={puedeEscribir}
                      onEditar={() => setInicialModal({ editar: true, idPartida: p.id })}
                    />
                  )
                })
              )}

              {intermedias.map((fecha) => {
                return (
                  <div key={fecha}>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">
                          Pesaje {fmtFechaCorta(fecha)}
                        </span>
                        {baseFecha && (
                          <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-info bg-info-soft">
                            a {diffDias(baseFecha, fecha)} días
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Total {fmtPeso(totalPorFecha(pesajes, fecha))} kg ·{' '}
                          {nPesadosFecha(fecha)} de {lote.animales.length} animales
                        </span>
                      </div>
                      {puedeEscribir && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setIntermedioModal({ fecha })}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" strokeWidth={2} />
                            Editar
                          </button>
                          <button
                            onClick={() => eliminarIntermedio(fecha)}
                            title="Eliminar este pesaje intermedio"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Pesajes finales: una fila por fecha (salidas/cierres parciales) */}
              {finales.map((fecha) => {
                const pesando = editandoFinalFecha === fecha
                const filasFecha = filasFinalDe(fecha)
                return (
                  <div key={fecha} className="bg-success-soft/40">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-success bg-success-soft">
                          <Flag className="size-3" strokeWidth={2} /> Final
                        </span>
                        <span className="font-medium text-foreground">
                          Pesaje {fmtFechaCorta(fecha)}
                        </span>
                        {baseFecha && (
                          <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-info bg-info-soft">
                            a {diffDias(baseFecha, fecha)} días
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Total {fmtPeso(totalFinalDe(fecha))} kg · {filasFecha.length} de{' '}
                          {lote.animales.length} animales
                        </span>
                      </div>
                      {puedeEscribir && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditandoFinalFecha(pesando ? null : fecha)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-accent transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" strokeWidth={2} />
                            {pesando ? 'Cancelar' : 'Editar'}
                          </button>
                          <button
                            onClick={() => eliminarFinal(fecha)}
                            title="Eliminar este pesaje final"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                    {pesando && puedeEscribir && (
                      <div className="px-3 pb-3">
                        <EditorPesos
                          animales={filasFecha}
                          fechaInicial={fecha}
                          modoMixto
                          submitLabel="Guardar pesaje final"
                          busy={finalEditBusy}
                          onSubmit={guardarFinalEdit}
                          onCancel={() => setEditandoFinalFecha(null)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Evolución de pesos: accordion colapsable dentro de la misma sección */}
            <div className="border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setEvolucionAbierta((v) => !v)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 transition-colors cursor-pointer ${evolucionAbierta
                  ? 'bg-muted/60 hover:bg-accent'
                  : 'bg-muted/40 hover:bg-accent'
                  }`}
                aria-expanded={evolucionAbierta}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="size-4 text-primary" strokeWidth={2} />
                  Evolución de pesos
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {evolucionAbierta ? 'Ocultar' : 'Ver evolución'}
                  <ChevronDown
                    className={`size-4 transition-transform ${evolucionAbierta ? '' : '-rotate-90'}`}
                    strokeWidth={2}
                  />
                </span>
              </button>
              {evolucionAbierta && (
                <div className="px-3 py-3 border-t border-border bg-card">
                  <EvolucionPesos
                    animales={lote.animales.map((a) => ({ id: a.id, nAnimal: a.nAnimal, caravana: a.caravana, idPartida: a.idPartida, estado: a.estado }))}
                    pesajes={pesajes}
                    partidas={partidas}
                  />
                </div>
              )}
            </div>
          </section>

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
                    onClick={() => setEdicionMasivaModal(true)}
                    disabled={lote.animales.length === 0}
                    title={lote.animales.length === 0 ? 'No hay animales' : 'Editar raza/categoría/pelaje en masa'}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Wand2 className="size-4" strokeWidth={2} /> Editar en masa
                  </button>
                  <button
                    onClick={() => setMasivaModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus className="size-4" strokeWidth={2} /> Cargar animales
                  </button>
                </div>
              )}
            </div>

            <Table<Animal>
              data={animalesOrdenados}
              emptyMessage="Todavía no hay animales en este lote."
              columns={[
                {
                  header: 'Caravana',
                  accessor: (a) => (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{a.caravana || '—'}</span>
                      {a.idCorralEnfermeria != null && (
                        <span className="inline-flex text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                          Enfermería
                        </span>
                      )}
                    </div>
                  ),
                },
                { header: 'Sexo', accessor: (a) => <span className="text-muted-foreground">{a.sexo === 'MACHO' ? 'Macho' : a.sexo === 'HEMBRA' ? 'Hembra' : '—'}</span> },
                { header: 'Pelaje', accessor: (a) => <span className="text-muted-foreground">{a.pelajeNombre || '—'}</span> },
                { header: 'Raza', accessor: (a) => <span className="text-muted-foreground">{a.razaNombre || '—'}</span> },
                { header: 'Categoría', accessor: (a) => <span className="text-muted-foreground">{a.categoriaNombre || '—'}</span> },
                { header: 'Peso ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoInicial)}</span> },
                { header: 'Neto ini.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoIni)}</span> },
                // Una columna por pesaje intermedio (lectura: se edita en el
                // contenedor de pesos, como el inicial).
                ...intermedias.map((fecha) => ({
                  header: `Peso ${fmtFechaCorta(fecha)}${baseFecha ? ` · ${diffDias(baseFecha, fecha)}d` : ''}`,
                  accessor: (a: Animal) => {
                    const p = pesajePorAnimalFecha.get(`${a.id}|${fecha}`)
                    return <span className="text-muted-foreground">{p ? fmtNum(p.peso) : '—'}</span>
                  },
                })),
                { header: 'Peso fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoFinal)}</span> },
                { header: 'Neto fin.', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.pesoNetoFin)}</span> },
                { header: 'Diferencia', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.diferencia)}</span> },
                { header: 'Aum. diario', accessor: (a) => <span className="text-muted-foreground">{fmtNum(a.aumDiario, 2)}</span> },
                {
                  header: 'Estado',
                  accessor: (a) => (
                    <div className="flex items-center gap-1.5">
                      {puedeEscribir && a.estado !== 'salido' ? (
                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                          {ESTADOS_ANIMAL.filter((e) => e !== 'salido').map((e) => (
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
                        const inmovil = a.estado === 'muerto' || a.estado === 'salido'
                        return (
                          <button
                            onClick={() => handleEnfermeriaToggle(a)}
                            disabled={inmovil}
                            title={
                              inmovil
                                ? a.estado === 'muerto'
                                  ? 'Un animal muerto no puede moverse'
                                  : 'Un animal salido ya no está en el corral'
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
          partidas={partidas}
          onClose={() => setAnimalModal({ open: false })}
          onOk={async (vals) => {
            await handleAnimalSave(vals)
            setAnimalModal({ open: false })
          }}
        />
      )}

      {masivaModal && lote && (
        <CargaMasivaModal
          loteNombre={lote.nombre}
          siguienteN={siguienteN}
          partidas={partidas}
          onClose={() => setMasivaModal(false)}
          onOk={handleMasivaSave}
        />
      )}

      {edicionMasivaModal && lote && (
        <EdicionMasivaModal
          lote={lote}
          onClose={() => setEdicionMasivaModal(false)}
          onOk={handleEdicionMasivaSave}
        />
      )}

      {enviarModal && (
        <EnviarEnfermeriaModal
          animalLabel={labelAnimal(enviarModal.animal)}
          enfermerias={enviarModal.enfermerias}
          onClose={() => setEnviarModal(null)}
          onOk={async (motivoId, idCorral, fecha, hora) => {
            await handleEnfermeria(enviarModal.animal, motivoId, idCorral, fecha, hora)
          }}
        />
      )}

      {traerModal && (
        <TraerEnfermeriaModal
          animalLabel={labelAnimal(traerModal)}
          onClose={() => setTraerModal(null)}
          onOk={async (estado, motivoId, fecha, hora) => {
            await handleTraer(traerModal, estado, motivoId, fecha, hora)
          }}
        />
      )}

      {estadoModal && (
        <CambioEstadoModal
          animalLabel={labelAnimal(estadoModal.animal)}
          estado={estadoModal.estado}
          onClose={() => setEstadoModal(null)}
          onOk={async (motivoId, fecha, hora) => {
            await aplicarEstado(estadoModal.animal, estadoModal.estado, motivoId, fecha, hora)
            setEstadoModal(null)
          }}
        />
      )}

      {movModal && lote && (
        <MovimientosModal
          loteId={lote.id}
          animal={{ id: movModal.id, nAnimal: movModal.nAnimal, caravana: movModal.caravana }}
          onClose={() => setMovModal(null)}
        />
      )}

      {inicialModal &&
        lote &&
        (() => {
          const esNuevo = !inicialModal.editar
          const filas = esNuevo ? filasInicialFaltantesFila() : filasInicialFila(inicialModal.idPartida!)
          const fIni = esNuevo ? ultimaFechaInicial : fechaInicialDe(inicialModal.idPartida!)
          const totalVivos = (lote.animales ?? []).filter(esVivo).length
          return (
            <PesajeLotePartidaModal
              animales={filas}
              partidas={partidas}
              titulo={esNuevo ? 'Agregar pesaje inicial' : 'Editar pesaje inicial'}
              descripcion={
                esNuevo
                  ? 'Cargá el peso inicial de los animales que aún no lo tienen. La fecha parte de la del último pesaje inicial; si elegís otra, se crea el inicial con esa fecha.'
                  : 'Corregí peso, desbaste o fecha. Se incluyen los animales salidos que ya tienen inicial.'
              }
              mostrarAlcance={esNuevo}
              fechaInicial={fIni}
              submitLabel="Guardar peso inicial"
              busy={pesajeBusy}
              notaParcial={
                esNuevo && animalesSinInicial.length < totalVivos
                  ? 'Carga parcial: sólo se muestran los animales que aún no tienen peso inicial.'
                  : undefined
              }
              onClose={() => setInicialModal(null)}
              onOk={onInicialOk}
            />
          )
        })()}

      {intermedioModal &&
        lote &&
        (() => {
          const esEdicion = intermedioModal.fecha != null
          const filas = esEdicion ? filasIntermedioFecha(intermedioModal.fecha!) : filasVivosFila()
          return (
            <PesajeLotePartidaModal
              animales={filas}
              partidas={partidas}
              titulo={
                esEdicion
                  ? `Editar pesaje ${fmtFechaCorta(intermedioModal.fecha!)}`
                  : 'Agregar pesaje intermedio'
              }
              descripcion={
                esEdicion
                  ? 'Corregí peso, desbaste o fecha. Se incluyen los animales salidos pesados en esta fecha; agregá los que entraron después.'
                  : 'Registra un peso para una fecha nueva, para todo el lote o una partida.'
              }
              mostrarAlcance
              fechaInicial={intermedioModal.fecha}
              submitLabel="Guardar pesaje"
              busy={pesajeBusy}
              onClose={() => setIntermedioModal(null)}
              onOk={(p) => onIntermedioOk(intermedioModal.fecha, p)}
            />
          )
        })()}

      {finalModal && lote && (
        <PesajeFinalModal
          animales={animalesSinFinalEditor}
          partidas={partidas}
          onClose={() => setFinalModal(false)}
          onOk={agregarFinal}
        />
      )}

      {salidaModal && lote && (
        <SalidaModal
          lote={lote}
          onClose={() => setSalidaModal(false)}
          onSaved={async () => {
            await mutateLote()
            await mutate('/lotes')
            await mutate('/corrales/mapa')
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
  onSubmit: (data: LoteFormSubmit) => Promise<void> | void
  /** Contenido extra en el header del formulario (p.ej. botón a la sección). */
  headerExtra?: React.ReactNode
}

function LoteForm({ lote, clientes, corrals, submitLabel, readOnly, onSubmit, headerExtra }: LoteFormProps) {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {lote ? lote.nombre : 'Nuevo lote'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Datos generales de la partida.</p>
        </div>
        {headerExtra}
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
          label="RENSPA origen"
          placeholder="Buscar o agregar renspa..."
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
  nuevaPartida?: boolean
  idPartida?: number
  pesoInicial?: number
  observaciones?: string
}

function AnimalModal({
  animal,
  siguienteN,
  partidas,
  onClose,
  onOk,
}: {
  animal?: Animal
  siguienteN: number
  /** Partidas del lote (para decidir nueva/unir al alta de un animal nuevo). */
  partidas: PartidaDto[]
  onClose: () => void
  onOk: (vals: AnimalFormValues) => Promise<void>
}) {
  const esEdicion = !!animal
  const [nAnimal, setNAnimal] = useState(
    animal?.nAnimal?.toString() ?? String(siguienteN),
  )
  const [caravana, setCaravana] = useState(animal?.caravana ?? '')
  const [idRaza, setIdRaza] = useState<string | number>(animal?.idRaza ?? '')
  const [idCategoria, setIdCategoria] = useState<string | number>(animal?.idCategoria ?? '')
  const [idPelaje, setIdPelaje] = useState<string | number>(animal?.idPelaje ?? '')
  const [observaciones, setObservaciones] = useState(animal?.observaciones ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Partida (sólo al alta): si el lote ya tiene animales pesados, decidir.
  const hayPesadas = partidas.some((p) => p.tieneInicial)
  const [destino, setDestino] = useState<'nueva' | 'existente'>('nueva')
  const [idPartida, setIdPartida] = useState<string | number>('')
  const [pesoInicial, setPesoInicial] = useState('')
  const partidaElegida = partidas.find((p) => p.id === Number(idPartida))
  const requierePeso = !esEdicion && hayPesadas && destino === 'existente' && !!partidaElegida?.tieneInicial

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
    if (!esEdicion && hayPesadas && destino === 'existente' && !idPartida) {
      setError('Elegí la partida existente.')
      return
    }
    if (requierePeso && !pesoInicial.trim()) {
      setError('La partida elegida ya está pesada: indicá el peso inicial del animal.')
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
        ...(esEdicion
          ? {}
          : {
            ...(hayPesadas && destino === 'nueva' ? { nuevaPartida: true } : {}),
            ...(destino === 'existente' && idPartida ? { idPartida: Number(idPartida) } : {}),
            ...(requierePeso ? { pesoInicial: toNum(pesoInicial) } : {}),
          }),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
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
          Los pesajes se cargan en la sección de pesajes del lote.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">N° animal</label>
            <input
              type="number"
              value={nAnimal}
              onChange={(e) => setNAnimal(e.target.value)}
              readOnly={esEdicion}
              title={esEdicion ? 'El N° no se puede editar' : undefined}
              className={`${inputCls} ${esEdicion ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
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

        {/* Partida (sólo al alta y si el lote ya tiene animales pesados) */}
        {!esEdicion && hayPesadas && (
          <div className="space-y-3 border border-border rounded-md p-4">
            <div className="text-sm font-medium text-foreground">Partida</div>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {(['nueva', 'existente'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDestino(d)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${destino === d
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {d === 'nueva' ? 'Nueva partida' : 'Partida existente'}
                </button>
              ))}
            </div>
            {destino === 'existente' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Partida *</label>
                <select
                  value={idPartida}
                  onChange={(e) => setIdPartida(e.target.value ? Number(e.target.value) : '')}
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="">Elegir partida...</option>
                  {partidas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {p.fecha} · {p.nAnimales} animales{p.tieneInicial ? ' · pesada' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {requierePeso && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Peso inicial (kg) *</label>
                <input type="number" step="0.01" min="0" value={pesoInicial} onChange={(e) => setPesoInicial(e.target.value)} className={inputCls} />
                <p className="text-xs text-muted-foreground">La partida elegida ya tiene pesaje inicial; se registra a esa fecha.</p>
              </div>
            )}
          </div>
        )}

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
