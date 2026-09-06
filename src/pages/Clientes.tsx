import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Loader2,
  Plus,
  Trash2,
  UserCog,
  AlertCircle,
  X,
  CheckCircle2,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { getRoleLabel } from '../constantes'

const ADMIN_KEY = 'adminEmpresaId'

interface Cliente {
  uid: string
  nombreUsuario: string | null
  email: string | null
  celular: string | null
  roles: string[]
  rol: string | null
  vinculadoDesde: string
}

interface Candidato {
  uid: string
  nombreUsuario: string | null
  email: string | null
}

type Tab = 'clientes' | 'operarios'

export default function Clientes() {
  const { isSysAdmin, isAnfitrion } = useAuth()
  const { mutate } = useSWRConfig()

  const canVer = isSysAdmin || isAnfitrion
  const [tab, setTab] = useState<Tab>('clientes')
  const [adminEmpresaId, setAdminEmpresaId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(ADMIN_KEY) || ''
  })

  const { data: empresas } = useSWR<{ id: number; nombre: string }[]>(canVer ? '/empresas' : null, fetcher)

  const clientesKey = isSysAdmin
    ? adminEmpresaId
      ? `/clientes?emp=${adminEmpresaId}`
      : null
    : '/clientes'

  const operariosKey = isSysAdmin
    ? adminEmpresaId
      ? `/clientes/operarios?emp=${adminEmpresaId}`
      : null
    : '/clientes/operarios'

  const candidatosKey = isSysAdmin
    ? adminEmpresaId
      ? `/clientes/candidatos?emp=${adminEmpresaId}`
      : null
    : '/clientes/candidatos'

  const { data: clientes, isLoading: loadingClientes } = useSWR<Cliente[]>(clientesKey, fetcher, {
    revalidateOnFocus: false,
  })
  const { data: operarios, isLoading: loadingOperarios } = useSWR<Candidato[]>(operariosKey, fetcher, {
    revalidateOnFocus: false,
  })
  const { data: candidatos } = useSWR<Candidato[]>(candidatosKey, fetcher, { revalidateOnFocus: false })

  const [modalOpen, setModalOpen] = useState(false)
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

  const refetch = async () => {
    await mutate(clientesKey)
    await mutate(operariosKey)
    await mutate(candidatosKey)
  }

  const handleDesvincular = async (u: Cliente) => {
    if (!window.confirm(`¿Desvincular a ${u.nombreUsuario || u.email || u.uid} de la empresa?`)) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.delete(`/clientes/${u.uid}`)
      setSuccess(`${u.nombreUsuario || u.email || u.uid} fue desvinculado.`)
      await refetch()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo desvincular.'))
    } finally {
      setBusy(false)
    }
  }

  const handlePromover = async (c: Cliente) => {
    if (!window.confirm(`¿Promover a ${c.nombreUsuario || c.email || c.uid} a operario de la empresa?`)) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/clientes/${c.uid}/rol`, { rol: 'operario' })
      setSuccess(`${c.nombreUsuario || c.email || c.uid} ahora es operario.`)
      await refetch()
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo promover.'))
    } finally {
      setBusy(false)
    }
  }

  if (!canVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  const isLoading = tab === 'clientes' ? loadingClientes : loadingOperarios

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Clientes y operarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vinculá clientes y operarios a tu empresa.
          </p>
        </div>
        <button
          onClick={() => {
            setModalOpen(true)
            setError('')
            setSuccess('')
          }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          <Plus className="size-4" strokeWidth={2} /> Agregar
        </button>
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

      <div className="inline-flex rounded-md border border-border bg-muted/40 p-1">
        {(['clientes', 'operarios'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'clientes' ? 'Clientes' : 'Operarios'}
          </button>
        ))}
      </div>

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
      ) : !clientesKey && !operariosKey ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">Seleccioná una empresa para ver sus usuarios.</p>
        </div>
      ) : tab === 'clientes' ? (
        <Table<Cliente>
          data={clientes || []}
          emptyMessage="No hay clientes vinculados a esta empresa todavía."
          columns={[
            {
              header: 'Nombre',
              accessor: (c) => <span className="font-medium text-foreground">{c.nombreUsuario || '—'}</span>,
            },
            { header: 'Email', accessor: (c) => <span className="text-muted-foreground">{c.email || '—'}</span> },
            { header: 'Celular', accessor: (c) => <span className="text-muted-foreground">{c.celular || '—'}</span> },
            {
              header: 'Rol',
              accessor: (c) => (
                <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary-soft rounded-full px-2 py-0.5">
                  {getRoleLabel(c.roles) || '—'}
                </span>
              ),
            },
            {
              header: '',
              accessor: (c) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => handlePromover(c)}
                    disabled={busy}
                    title="Promover a operario"
                    className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <UserCog className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDesvincular(c)}
                    disabled={busy}
                    title="Desvincular"
                    className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <Table<Candidato>
          data={operarios || []}
          emptyMessage="No hay operarios en esta empresa todavía."
          columns={[
            {
              header: 'Nombre',
              accessor: (o) => <span className="font-medium text-foreground">{o.nombreUsuario || '—'}</span>,
            },
            { header: 'Email', accessor: (o) => <span className="text-muted-foreground">{o.email || '—'}</span> },
            {
              header: '',
              accessor: (o) => (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => handleDesvincular(o as Cliente)}
                    disabled={busy}
                    title="Desvincular"
                    className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {modalOpen && (
        <AgregarModal
          candidatos={candidatos || []}
          onClose={() => setModalOpen(false)}
          onOk={async (uid, rol) => {
            setBusy(true)
            setError('')
            try {
              await api.post('/clientes', { uid, rol })
              setModalOpen(false)
              setSuccess(rol === 'operario' ? 'Operario vinculado correctamente.' : 'Cliente vinculado correctamente.')
              await refetch()
            } catch (err) {
              console.error(err)
              setError(extractMsg(err, 'No se pudo vincular al usuario.'))
            } finally {
              setBusy(false)
            }
          }}
          busy={busy}
        />
      )}
    </div>
  )
}

function AgregarModal({
  candidatos,
  onClose,
  onOk,
  busy,
}: {
  candidatos: Candidato[]
  onClose: () => void
  onOk: (uid: string, rol: 'cliente' | 'operario') => Promise<void>
  busy: boolean
}) {
  const [uid, setUid] = useState<string | number>('')
  const [rol, setRol] = useState<string | number>('cliente')
  const [error, setError] = useState('')

  const options = candidatos.map((c) => ({
    value: c.uid,
    label: c.nombreUsuario || c.email || c.uid,
  }))

  const submit = async () => {
    if (!uid) {
      setError('Elegí un usuario para vincular.')
      return
    }
    setError('')
    await onOk(String(uid), String(rol) as 'cliente' | 'operario')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Agregar a la empresa</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        {candidatos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay usuarios disponibles para vincular. Los usuarios se registran sin rol; pediles que se registren y
            luego agregalos acá.
          </p>
        ) : (
          <>
            <SelectAutocomplete
              label="Usuario"
              placeholder="Buscar usuario..."
              value={uid}
              onChange={setUid}
              options={options}
              autoSelectSingle
            />
            <SelectAutocomplete
              label="Rol"
              placeholder="Seleccionar rol..."
              value={rol}
              onChange={setRol}
              options={[
                { value: 'cliente', label: 'Cliente' },
                { value: 'operario', label: 'Operario' },
              ]}
            />
          </>
        )}

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
            disabled={busy || candidatos.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={2} />}
            Vincular
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}