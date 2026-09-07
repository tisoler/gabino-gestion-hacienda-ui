import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'

interface AdminItem {
  id: number
  nombre: string
  idEmpresa: number | null
  global: boolean
  /** Sólo categoria. */
  sexo?: string | null
  empresaNombre: string | null
  createdAt: string
}

interface Empresa {
  id: number
  nombre: string
}

const SCOPE_TODAS = 'todas'
const SCOPE_GLOBAL = 'global'
const SCOPE_EMPRESA = 'empresa'

/**
 * Vista sys-admin de un catálogo (razas o categorías de animales): listado
 * con filtro por alcance (todas | globales | una empresa) y alta de valores
 * globales o para una empresa puntual.
 */
export default function CatalogoAdmin({
  tipo,
  titulo,
  nombreValor,
}: {
  /** Segmento del endpoint: 'raza' | 'categoria'. */
  tipo: 'raza' | 'categoria'
  titulo: string
  /** Etiqueta del valor para los mensajes ("raza", "categoría"). */
  nombreValor: string
}) {
  const { isSysAdmin } = useAuth()
  const { mutate } = useSWRConfig()

  const [scope, setScope] = useState<string>(SCOPE_TODAS)
  const [empresaFiltro, setEmpresaFiltro] = useState<string | number>('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoScope, setNuevoScope] = useState<string | number>(SCOPE_GLOBAL)
  const [nuevoSexo, setNuevoSexo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: empresas } = useSWR<Empresa[]>(
    isSysAdmin ? '/empresas' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Listado admin: scope 'todas' | 'global' | 'empresa' + idEmpresa.
  const empresaActiva = scope === SCOPE_EMPRESA && empresaFiltro ? Number(empresaFiltro) : null
  const scopeQuery = scope === SCOPE_EMPRESA ? (empresaActiva ? 'empresa' : 'todas') : scope
  const listKey = isSysAdmin
    ? `/catalogos/${tipo}/admin?scope=${scopeQuery}${empresaActiva ? `&idEmpresa=${empresaActiva}` : ''}`
    : null

  const { data: items, isLoading } = useSWR<AdminItem[]>(listKey, fetcher)

  if (!isSysAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Esta sección es sólo para el administrador del sistema.
        </p>
      </div>
    )
  }

  const empresaOptions = (empresas || []).map((e) => ({ value: e.id, label: e.nombre }))

  const agregar = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) {
      setError(`Ingresá el nombre de la ${nombreValor}.`)
      return
    }
    if (nuevoScope !== SCOPE_GLOBAL && !nuevoScope) {
      setError('Elegí la empresa destino (o dejá Global).')
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.post(`/catalogos/${tipo}/admin`, {
        nombre,
        ...(nuevoScope === SCOPE_GLOBAL ? {} : { idEmpresa: Number(nuevoScope) }),
        ...(tipo === 'categoria' && nuevoSexo ? { sexo: nuevoSexo } : {}),
      })
      setNuevoNombre('')
      setNuevoSexo('')
      setSuccess(`${nombreValor[0].toUpperCase()}${nombreValor.slice(1)} agregada.`)
      await mutate(listKey)
      await mutate(`/catalogos/${tipo}`)
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || `No se pudo agregar la ${nombreValor}.`,
      )
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Valores globales (para todas las empresas) y valores creados por cada
          empresa desde sus formularios.
        </p>
      </div>

      {/* Filtro por alcance */}
      <section className="bg-card border border-border rounded-lg p-5 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <SelectAutocomplete
          label="Alcance"
          value={scope}
          onChange={(v) => setScope(String(v))}
          options={[
            { value: SCOPE_TODAS, label: 'Todas' },
            { value: SCOPE_GLOBAL, label: 'Sólo globales' },
            { value: SCOPE_EMPRESA, label: 'Una empresa' },
          ]}
        />
        {scope === SCOPE_EMPRESA && (
          <SelectAutocomplete
            label="Empresa"
            placeholder="Seleccionar empresa..."
            value={empresaFiltro}
            onChange={setEmpresaFiltro}
            options={empresaOptions}
          />
        )}
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

      {/* Alta */}
      <section className="bg-card border border-border rounded-lg p-5 space-y-3 max-w-2xl">
        <h2 className="text-sm font-semibold text-foreground">Agregar {nombreValor}</h2>
        <div className={`grid gap-3 sm:items-end ${tipo === 'categoria' ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'}`}>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Nombre *</label>
            <input
              type="text"
              value={nuevoNombre}
              onChange={(e) => {
                setNuevoNombre(e.target.value)
                setSuccess('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void agregar()
                }
              }}
              placeholder={`Nombre de la ${nombreValor}`}
              className={inputCls}
            />
          </div>
          <SelectAutocomplete
            label="Destino"
            value={nuevoScope}
            onChange={setNuevoScope}
            options={[{ value: SCOPE_GLOBAL, label: 'Global (todas las empresas)' }, ...empresaOptions]}
          />
          {tipo === 'categoria' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Sexo</label>
              <select
                value={nuevoSexo}
                onChange={(e) => setNuevoSexo(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">Indistinto</option>
                <option value="MACHO">Macho</option>
                <option value="HEMBRA">Hembra</option>
              </select>
            </div>
          )}
          <button
            onClick={agregar}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2} />}
            Agregar
          </button>
        </div>
      </section>

      {/* Listado */}
      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : (
        <Table<AdminItem>
          data={items || []}
          emptyMessage={`No hay ${nombreValor}s para el filtro seleccionado.`}
          columns={[
            {
              header: 'Nombre',
              accessor: (r) => <span className="font-medium text-foreground">{r.nombre}</span>,
            },
            ...(tipo === 'categoria'
              ? [
                  {
                    header: 'Sexo',
                    accessor: (r: AdminItem) => (
                      <span className="text-sm text-muted-foreground">
                        {r.sexo === 'MACHO' ? 'Macho' : r.sexo === 'HEMBRA' ? 'Hembra' : 'Indistinto'}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              header: 'Alcance',
              accessor: (r) =>
                r.global ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-primary bg-primary-soft">
                    <Globe className="size-3" strokeWidth={2} /> Global
                  </span>
                ) : (
                  <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-info bg-info-soft">
                    {r.empresaNombre ?? `Empresa #${r.idEmpresa}`}
                  </span>
                ),
            },
            {
              header: 'Creada',
              accessor: (r) => (
                <span className="text-sm text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('es-AR')}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
