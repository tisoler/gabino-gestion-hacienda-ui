import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { TratamientoModal, type TratamientoFormValues } from '../components/TratamientoModal'
import { fmtPrecio, type TratamientoView } from '../lib/veterinaria'

type Scope = 'todas' | 'global' | 'empresa'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

export default function Tratamientos() {
  const { permisos, isSysAdmin, currentEmpresaId, currentEmpresa } = useAuth()
  const { mutate } = useSWRConfig()
  const puedeVer = permisos.includes('lectura:veterinaria')
  const puedeEscribir = permisos.includes('escritura:veterinaria')

  const [scope, setScope] = useState<Scope>('todas')
  const [scopeEmpresaId, setScopeEmpresaId] = useState<number | null>(null)

  // Empresas para que el sys-admin elija alcance (Por empresa / modal).
  const { data: empresas } = useSWR<{ id: number; nombre: string }[]>(
    puedeVer && isSysAdmin ? '/empresas' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const nombreEmpresa = (id: number | null) =>
    id == null ? '' : (empresas ?? []).find((e) => e.id === id)?.nombre ?? `Empresa ${id}`

  const empresaFiltro = isSysAdmin ? scopeEmpresaId : currentEmpresaId
  const listKey = !puedeVer
    ? null
    : scope === 'empresa' && empresaFiltro == null
      ? null
      : `/tratamientos?estado=${puedeEscribir ? 'todas' : 'activas'}&scope=${scope}${scope === 'empresa' && empresaFiltro != null ? `&idEmpresa=${empresaFiltro}` : ''}`

  const { data: tratamientos, isLoading } = useSWR<TratamientoView[]>(listKey, fetcher, {
    revalidateOnFocus: false,
  })

  const [modal, setModal] = useState<{ open: boolean; tratamiento?: TratamientoView }>({ open: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Un tratamiento global sólo lo gestiona el sys-admin; uno de empresa, su dueño.
  const puedeGestionar = (t: TratamientoView) => puedeEscribir && (isSysAdmin || t.idEmpresa != null)

  const handleSave = async (vals: TratamientoFormValues) => {
    if (modal.tratamiento) {
      await api.patch(`/tratamientos/${modal.tratamiento.id}`, vals)
    } else {
      await api.post('/tratamientos', vals)
    }
    await mutate(listKey)
  }

  const handleToggleActivo = async (t: TratamientoView) => {
    const msg = t.activo
      ? `¿Deshabilitar el tratamiento "${t.nombre}"?`
      : `¿Habilitar el tratamiento "${t.nombre}"?`
    if (!window.confirm(msg)) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/tratamientos/${t.id}/activo`, { activo: !t.activo })
      setSuccess(t.activo ? 'Tratamiento deshabilitado.' : 'Tratamiento habilitado.')
      await mutate(listKey)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo cambiar el estado del tratamiento.'))
    } finally {
      setBusy(false)
    }
  }

  if (!puedeVer) {
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
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Tratamientos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catálogo de tratamientos veterinarios, globales o por empresa.
          </p>
        </div>
        {puedeEscribir && (
          <button
            onClick={() => {
              setModal({ open: true })
              setError('')
              setSuccess('')
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} /> Nuevo tratamiento
          </button>
        )}
      </div>

      <section className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alcance</span>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {([
              ['todas', 'Todas'],
              ['global', 'Global'],
              ['empresa', 'Por empresa'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${scope === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-foreground hover:bg-muted'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scope === 'empresa' && isSysAdmin && (
            <div className="w-56">
              <SelectAutocomplete
                placeholder="Seleccionar empresa"
                value={scopeEmpresaId ?? ''}
                onChange={(v) => setScopeEmpresaId(v === '' ? null : Number(v))}
                options={(empresas ?? []).map((e) => ({ value: e.id, label: e.nombre }))}
              />
            </div>
          )}
          {scope === 'empresa' && isSysAdmin && scopeEmpresaId == null && (
            <span className="text-xs text-muted-foreground">Elegí una empresa para ver sus tratamientos.</span>
          )}
          {scope === 'empresa' && !isSysAdmin && currentEmpresa && (
            <span className="text-xs text-muted-foreground">Mostrando los tratamientos de {currentEmpresa}.</span>
          )}
        </div>
      </section>

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
          <p className="text-sm text-muted-foreground">Seleccioná una empresa para ver sus tratamientos.</p>
        </div>
      ) : (
        <Table<TratamientoView>
          data={tratamientos || []}
          emptyMessage="Todavía no hay tratamientos. Creá el primero."
          columns={[
            {
              header: 'Ingreso',
              accessor: (t) => (
                <span className="text-muted-foreground whitespace-nowrap">{fmtFecha(t.createdAt)}</span>
              ),
            },
            {
              header: 'Tratamiento',
              accessor: (t) => (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t.nombre}</p>
                  {t.descripcion && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{t.descripcion}</p>
                  )}
                </div>
              ),
            },
            {
              header: 'Precio ref.',
              accessor: (t) => (
                <span className="text-sm text-muted-foreground tabular-nums">{fmtPrecio(t.precioReferencia)}</span>
              ),
            },
            {
              header: 'Alcance',
              accessor: (t) => (
                t.idEmpresa == null ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                    <Globe className="size-3" strokeWidth={2} />
                    Global
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                    <Package className="size-3" strokeWidth={2} />
                    {isSysAdmin ? nombreEmpresa(t.idEmpresa) : 'Mi empresa'}
                  </span>
                )
              ),
            },
            {
              header: 'Estado',
              accessor: (t) => (
                <span
                  className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${t.activo
                    ? 'text-success bg-success-soft'
                    : 'text-muted-foreground bg-muted'
                    }`}
                >
                  {t.activo ? 'Activo' : 'Inactivo'}
                </span>
              ),
            },
            {
              header: '',
              accessor: (t) => {
                if (!puedeEscribir) return null
                if (!puedeGestionar(t)) {
                  return (
                    <div className="flex items-center justify-end">
                      <span
                        className="p-2 rounded-md bg-muted text-muted-foreground inline-flex"
                        title="Este tratamiento es global y sólo lo gestiona el administrador"
                      >
                        <Lock className="size-4" strokeWidth={1.75} />
                      </span>
                    </div>
                  )
                }
                return (
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => {
                        setModal({ open: true, tratamiento: t })
                        setError('')
                      }}
                      title="Editar"
                      className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                    >
                      <Pencil className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => handleToggleActivo(t)}
                      disabled={busy}
                      title={t.activo ? 'Deshabilitar' : 'Habilitar'}
                      className={`p-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${t.activo
                        ? 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive'
                        : 'text-muted-foreground hover:bg-success-soft hover:text-success'
                        }`}
                    >
                      {t.activo ? <PowerOff className="size-4" strokeWidth={1.75} /> : <Power className="size-4" strokeWidth={1.75} />}
                    </button>
                  </div>
                )
              },
            },
          ]}
        />
      )}

      {modal.open && (
        <TratamientoModal
          tratamiento={modal.tratamiento}
          empresas={empresas ?? []}
          puedeElegirAlcance={isSysAdmin}
          onClose={() => setModal({ open: false })}
          onOk={async (vals) => {
            await handleSave(vals)
            setModal({ open: false })
            setSuccess(modal.tratamiento ? 'Tratamiento actualizado.' : 'Tratamiento creado.')
          }}
        />
      )}
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
