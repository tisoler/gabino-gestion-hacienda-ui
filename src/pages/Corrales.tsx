import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Loader2,
  Plus,
  Pencil,
  Power,
  PowerOff,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { CORRAL_TIPOS, CORRAL_TIPO_LABELS } from '../constantes'

const ADMIN_KEY = 'adminEmpresaId'

interface Corral {
  id: number
  nombre: string
  tipo: string
  capacidad: number | null
  descripcion: string | null
  activo: boolean
  estado: string
  lotesOcupantes: { id: number; nombre: string; color: string | null }[]
  nAnimales: number
}

export default function Corrales() {
  const { permisos, isSysAdmin, isCliente } = useAuth()
  const { mutate } = useSWRConfig()

  // La vista de corrales es sólo para anfitrión/operario/sys-admin: el
  // cliente tiene lectura:corral pero usa únicamente el mapa de Lotes
  // (/corrales/mapa, filtrado a sus lotes).
  const puedeVerVista = permisos.includes('lectura:corral') && !isCliente
  const puedeEditar = permisos.includes('escritura:corral')

  const [adminEmpresaId, setAdminEmpresaId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(ADMIN_KEY) || ''
  })

  const { data: empresas } = useSWR<{ id: number; nombre: string }[]>(
    puedeVerVista ? '/empresas' : null,
    fetcher,
  )

  const listKey = !puedeVerVista
    ? null
    : isSysAdmin
      ? adminEmpresaId
        ? `/corrales?emp=${adminEmpresaId}`
        : null
      : '/corrales'

  const { data: corrales, isLoading } = useSWR<Corral[]>(listKey, fetcher, {
    revalidateOnFocus: false,
  })

  const [modal, setModal] = useState<{ open: boolean; corral?: Corral }>({ open: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const pickEmpresa = (val: string | number) => {
    const id = String(val)
    setAdminEmpresaId(id)
    try {
      window.localStorage.setItem(ADMIN_KEY, id)
    } catch {
      /* noop */
    }
  }

  const handleSave = async (vals: { nombre: string; tipo: string; capacidad: string; descripcion: string }) => {
    if (modal.corral) {
      await api.patch(`/corrales/${modal.corral.id}`, {
        nombre: vals.nombre,
        capacidad: vals.capacidad ? Number(vals.capacidad) : null,
        descripcion: vals.descripcion || null,
      })
    } else {
      await api.post('/corrales', {
        nombre: vals.nombre,
        tipo: vals.tipo,
        capacidad: vals.capacidad ? Number(vals.capacidad) : undefined,
        descripcion: vals.descripcion || undefined,
      })
    }
    await mutate(listKey)
  }

  const handleToggleActivo = async (c: Corral) => {
    const msg = c.activo
      ? `¿Deshabilitar el corral "${c.nombre}"?`
      : `¿Habilitar el corral "${c.nombre}"?`
    if (!window.confirm(msg)) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/corrales/${c.id}/activo`, { activo: !c.activo })
      setSuccess(c.activo ? 'Corral deshabilitado.' : 'Corral habilitado.')
      await mutate(listKey)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo cambiar el estado del corral.'))
    } finally {
      setBusy(false)
    }
  }

  if (!puedeVerVista) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Corrales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comunes (alojan un lote) y de enfermería (animales de varios lotes).
          </p>
        </div>
        {puedeEditar && (
          <button
            onClick={() => {
              setModal({ open: true })
              setError('')
              setSuccess('')
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} /> Nuevo corral
          </button>
        )}
      </div>

      {isSysAdmin && (
        <section className="bg-card border border-border rounded-lg p-5 max-w-md">
          <SelectAutocomplete
            label="Empresa"
            placeholder="Seleccionar empresa..."
            value={adminEmpresaId}
            onChange={pickEmpresa}
            options={(empresas || []).map((e) => ({ value: e.id, label: e.nombre }))}
            clearable
          />
        </section>
      )}

      {error && (
        <div role="alert" className="p-3 bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="p-3 bg-success-soft border border-success/20 text-success text-sm rounded-md flex items-center gap-2.5">
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
          <span>{success}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : !listKey ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">Seleccioná una empresa para ver sus corrales.</p>
        </div>
      ) : (
        <Table<Corral>
          data={corrales || []}
          emptyMessage="Todavía no hay corrales. Creá el primero."
          columns={[
            {
              header: 'Corral',
              accessor: (c) => (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{c.nombre}</p>
                  {c.descripcion && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{c.descripcion}</p>
                  )}
                </div>
              ),
            },
            {
              header: 'Tipo',
              accessor: (c) => (
                <span
                  className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                    c.tipo === CORRAL_TIPOS.ENFERMERIA ? 'text-info bg-info-soft' : 'text-primary bg-primary-soft'
                  }`}
                >
                  {CORRAL_TIPO_LABELS[c.tipo] ?? c.tipo}
                </span>
              ),
            },
            {
              header: 'Estado',
              accessor: (c) => {
                if (!c.activo) {
                  return (
                    <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-muted-foreground bg-muted">
                      Inactivo
                    </span>
                  )
                }
                if (c.tipo === CORRAL_TIPOS.ENFERMERIA) {
                  return <span className="text-sm text-muted-foreground">{c.nAnimales} en enfermería</span>
                }
                return c.lotesOcupantes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {c.lotesOcupantes.map((l) => (
                      <div key={l.id} className="flex items-center gap-1.5">
                        <span
                          className="size-3.5 rounded-full shrink-0 border border-border"
                          style={{ backgroundColor: l.color ?? '#57534E' }}
                          aria-hidden
                        />
                        <span className="text-sm text-foreground">{l.nombre}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-success bg-success-soft">
                    Libre
                  </span>
                )
              },
            },
            {
              header: 'Capacidad',
              accessor: (c) => (
                <span className="text-sm text-muted-foreground">
                  {c.nAnimales > 0 || c.tipo === CORRAL_TIPOS.ENFERMERIA
                    ? `${c.nAnimales}${c.capacidad ? ` / ${c.capacidad}` : ''}`
                    : '—'}
                </span>
              ),
            },
            {
              header: '',
              accessor: (c) => (
                puedeEditar ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => {
                        setModal({ open: true, corral: c })
                        setError('')
                      }}
                      title="Editar"
                      className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                    >
                      <Pencil className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => handleToggleActivo(c)}
                      disabled={busy}
                      title={c.activo ? 'Deshabilitar' : 'Habilitar'}
                      className={`p-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
                        c.activo
                          ? 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive'
                          : 'text-muted-foreground hover:bg-success-soft hover:text-success'
                      }`}
                    >
                      {c.activo ? <PowerOff className="size-4" strokeWidth={1.75} /> : <Power className="size-4" strokeWidth={1.75} />}
                    </button>
                  </div>
                ) : null
              ),
            },
          ]}
        />
      )}

      {modal.open && (
        <CorralModal
          corral={modal.corral}
          onClose={() => setModal({ open: false })}
          onOk={async (vals) => {
            await handleSave(vals)
            setModal({ open: false })
            setSuccess(modal.corral ? 'Corral actualizado.' : 'Corral creado.')
          }}
        />
      )}
    </div>
  )
}

interface CorralFormValues {
  nombre: string
  tipo: string
  capacidad: string
  descripcion: string
}

function CorralModal({
  corral,
  onClose,
  onOk,
}: {
  corral?: Corral
  onClose: () => void
  onOk: (vals: CorralFormValues) => Promise<void>
}) {
  const editando = !!corral
  const [nombre, setNombre] = useState(corral?.nombre ?? '')
  const [tipo, setTipo] = useState<string>(corral?.tipo ?? CORRAL_TIPOS.COMUN)
  const [capacidad, setCapacidad] = useState(corral?.capacidad?.toString() ?? '')
  const [descripcion, setDescripcion] = useState(corral?.descripcion ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onOk({ nombre, tipo, capacidad, descripcion })
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el corral.'))
      setBusy(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {editando ? `Editar corral "${corral.nombre}"` : 'Nuevo corral'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="corral-nombre" className="text-sm font-medium text-foreground">Nombre *</label>
          <input id="corral-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} placeholder="Ej: Corral 1" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="corral-tipo" className="text-sm font-medium text-foreground">Tipo *</label>
          <select
            id="corral-tipo"
            value={tipo}
            disabled={editando}
            onChange={(e) => setTipo(e.target.value)}
            className={`${inputCls} cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <option value={CORRAL_TIPOS.COMUN}>Común (aloja un lote)</option>
            <option value={CORRAL_TIPOS.ENFERMERIA}>Enfermería (recibe animales de varios lotes)</option>
          </select>
          {editando && (
            <p className="text-xs text-muted-foreground">El tipo no se puede modificar tras la creación.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="corral-capacidad" className="text-sm font-medium text-foreground">
            Capacidad <span className="font-normal text-muted-foreground">— informativa</span>
          </label>
          <input id="corral-capacidad" type="number" min={1} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className={inputCls} placeholder="Ej: 30" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="corral-descripcion" className="text-sm font-medium text-foreground">Descripción</label>
          <textarea id="corral-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
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
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editando ? 'Guardar cambios' : 'Crear corral'}
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}