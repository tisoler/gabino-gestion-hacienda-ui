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
  Tag,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { InsumoModal, type InsumoFormValues } from '../components/InsumoModal'
import { INSUMO_UNIDAD_LABELS, colorCategoriaInsumo } from '../constantes'

interface CategoriaInsumo {
  id: number
  nombre: string
  idEmpresa: number | null
  activa: boolean
}

interface Insumo {
  id: number
  nombre: string
  descripcion: string | null
  idCategoria: number | null
  categoria?: { id: number; nombre: string } | null
  idEmpresa: number | null
  /** NUMERIC de pg llega como string. */
  precioReferencia: number | string | null
  unidad: string | null
  activo: boolean
}

type Scope = 'todas' | 'global' | 'empresa'

const fmtPrecio = (p: number | string | null | undefined): string => {
  if (p == null || p === '') return '—'
  const n = Number(p)
  if (isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Insumos() {
  const { permisos, isSysAdmin, currentEmpresaId, currentEmpresa } = useAuth()
  const { mutate } = useSWRConfig()
  const puedeVer = permisos.includes('lectura:insumo')
  const puedeEscribir = permisos.includes('escritura:insumo')

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
      : `/insumos?estado=${puedeEscribir ? 'todas' : 'activas'}&scope=${scope}${scope === 'empresa' && empresaFiltro != null ? `&idEmpresa=${empresaFiltro}` : ''}`

  const { data: insumos, isLoading } = useSWR<Insumo[]>(listKey, fetcher, {
    revalidateOnFocus: false,
  })

  const { data: categorias } = useSWR<CategoriaInsumo[]>(
    puedeVer ? '/insumos/categorias' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const [modal, setModal] = useState<{ open: boolean; insumo?: Insumo }>({ open: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Un insumo global sólo lo gestiona el sys-admin; uno de empresa, su dueño.
  const puedeGestionar = (i: Insumo) => puedeEscribir && (isSysAdmin || i.idEmpresa != null)

  const handleSave = async (vals: InsumoFormValues) => {
    if (modal.insumo) {
      await api.patch(`/insumos/${modal.insumo.id}`, vals)
    } else {
      await api.post('/insumos', vals)
    }
    await mutate(listKey)
  }

  const handleToggleActivo = async (i: Insumo) => {
    const msg = i.activo
      ? `¿Deshabilitar el insumo "${i.nombre}"?`
      : `¿Habilitar el insumo "${i.nombre}"?`
    if (!window.confirm(msg)) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/insumos/${i.id}/activo`, { activo: !i.activo })
      setSuccess(i.activo ? 'Insumo deshabilitado.' : 'Insumo habilitado.')
      await mutate(listKey)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo cambiar el estado del insumo.'))
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
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Insumos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catálogo de insumos con precio de referencia, globales o por empresa.
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
            <Plus className="size-4" strokeWidth={2} /> Nuevo insumo
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
            <span className="text-xs text-muted-foreground">Elegí una empresa para ver sus insumos.</span>
          )}
          {scope === 'empresa' && !isSysAdmin && currentEmpresa && (
            <span className="text-xs text-muted-foreground">Mostrando los insumos de {currentEmpresa}.</span>
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
          <p className="text-sm text-muted-foreground">Seleccioná una empresa para ver sus insumos.</p>
        </div>
      ) : (
        <Table<Insumo>
          data={insumos || []}
          emptyMessage="Todavía no hay insumos. Creá el primero."
          columns={[
            {
              header: 'Insumo',
              accessor: (i) => (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{i.nombre}</p>
                  {i.descripcion && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{i.descripcion}</p>
                  )}
                </div>
              ),
            },
            {
              header: 'Categoría',
              accessor: (i) => (
                i.categoria ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[11px] font-medium rounded"
                    style={{ backgroundColor: colorCategoriaInsumo(i.idCategoria, categorias ?? []) }}
                  >
                    <Tag className="size-3" strokeWidth={1.75} />
                    {i.categoria.nombre}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )
              ),
            },
            {
              header: 'Precio ref.',
              accessor: (i) => (
                <span className="text-sm text-muted-foreground tabular-nums">{fmtPrecio(i.precioReferencia)}</span>
              ),
            },
            {
              header: 'Unidad',
              accessor: (i) => (
                <span className="text-sm text-muted-foreground">
                  {i.unidad ? (INSUMO_UNIDAD_LABELS[i.unidad] ?? i.unidad) : '—'}
                </span>
              ),
            },
            {
              header: 'Alcance',
              accessor: (i) => (
                i.idEmpresa == null ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-info-soft text-info text-[10px] font-semibold uppercase tracking-wider rounded">
                    <Globe className="size-3" strokeWidth={2} />
                    Global
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-soft text-warning-foreground text-[10px] font-semibold uppercase tracking-wider rounded">
                    <Package className="size-3" strokeWidth={2} />
                    {isSysAdmin ? nombreEmpresa(i.idEmpresa) : 'Mi empresa'}
                  </span>
                )
              ),
            },
            {
              header: 'Estado',
              accessor: (i) => (
                <span
                  className={`inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${i.activo
                    ? 'text-success bg-success-soft'
                    : 'text-muted-foreground bg-muted'
                    }`}
                >
                  {i.activo ? 'Activo' : 'Inactivo'}
                </span>
              ),
            },
            {
              header: '',
              accessor: (i) => {
                if (!puedeEscribir) return null
                if (!puedeGestionar(i)) {
                  return (
                    <div className="flex items-center justify-end">
                      <span
                        className="p-2 rounded-md bg-muted text-muted-foreground inline-flex"
                        title="Este insumo es global y sólo lo gestiona el administrador"
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
                        setModal({ open: true, insumo: i })
                        setError('')
                      }}
                      title="Editar"
                      className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                    >
                      <Pencil className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => handleToggleActivo(i)}
                      disabled={busy}
                      title={i.activo ? 'Deshabilitar' : 'Habilitar'}
                      className={`p-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${i.activo
                        ? 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive'
                        : 'text-muted-foreground hover:bg-success-soft hover:text-success'
                        }`}
                    >
                      {i.activo ? <PowerOff className="size-4" strokeWidth={1.75} /> : <Power className="size-4" strokeWidth={1.75} />}
                    </button>
                  </div>
                )
              },
            },
          ]}
        />
      )}

      {modal.open && (
        <InsumoModal
          insumo={modal.insumo}
          categorias={categorias ?? []}
          empresas={empresas ?? []}
          puedeElegirAlcance={isSysAdmin}
          onClose={() => setModal({ open: false })}
          onOk={async (vals) => {
            await handleSave(vals)
            setModal({ open: false })
            setSuccess(modal.insumo ? 'Insumo actualizado.' : 'Insumo creado.')
          }}
        />
      )}
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}
