import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Loader2,
  UserCog,
  AlertCircle,
  X,
  CheckCircle2,
} from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { getRoleLabel, ROL_ASIGNABLE_OPTIONS } from '../constantes'

interface Usuario {
  uid: string
  nombreUsuario: string | null
  email: string | null
  celular: string | null
  roles: string[]
  idEmpresas: number[]
}

export default function Usuarios() {
  const { isSysAdmin } = useAuth()
  const { mutate } = useSWRConfig()

  const { data: usuarios, isLoading } = useSWR<Usuario[]>('/usuarios/candidatos', fetcher, {
    revalidateOnFocus: false,
  })

  const [rolModal, setRolModal] = useState<Usuario | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleAsignarRol = async (uid: string, idRol: number) => {
    setBusy(true)
    setError('')
    try {
      await api.patch(`/usuarios/${uid}/rol`, { idRol })
      setRolModal(null)
      setSuccess('Rol asignado correctamente.')
      await mutate('/usuarios/candidatos')
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo asignar el rol.'))
    } finally {
      setBusy(false)
    }
  }

  if (!isSysAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver esta sección.</p>
      </div>
    )
  }

  const pendientes = (usuarios || []).filter((u) => u.roles.length === 0).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Asigná el rol a los usuarios nuevos: {pendientes > 0 ? `${pendientes} sin rol asignado.` : 'todos tienen rol.'}
        </p>
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
      ) : (
        <Table<Usuario>
          data={usuarios || []}
          emptyMessage="No hay usuarios registrados todavía."
          columns={[
            {
              header: 'Nombre',
              accessor: (u) => (
                <span className="font-medium text-foreground">{u.nombreUsuario || '—'}</span>
              ),
            },
            { header: 'Email', accessor: (u) => <span className="text-muted-foreground">{u.email || '—'}</span> },
            { header: 'Celular', accessor: (u) => <span className="text-muted-foreground">{u.celular || '—'}</span> },
            {
              header: 'Rol',
              accessor: (u) =>
                u.roles.length === 0 ? (
                  <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide text-warning bg-warning-soft rounded-full px-2 py-0.5">
                    Sin rol
                  </span>
                ) : (
                  <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary-soft rounded-full px-2 py-0.5">
                    {getRoleLabel(u.roles)}
                  </span>
                ),
            },
            {
              header: '',
              accessor: (u) => (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => {
                      setRolModal(u)
                      setError('')
                    }}
                    disabled={busy}
                    title="Asignar rol"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-soft hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <UserCog className="size-3.5" strokeWidth={1.75} />
                    Asignar rol
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {rolModal && (
        <AsignarRolModal
          usuario={rolModal}
          onClose={() => setRolModal(null)}
          onOk={async (idRol) => {
            await handleAsignarRol(rolModal.uid, idRol)
          }}
          busy={busy}
        />
      )}
    </div>
  )
}

function AsignarRolModal({
  usuario,
  onClose,
  onOk,
  busy,
}: {
  usuario: Usuario
  onClose: () => void
  onOk: (idRol: number) => Promise<void>
  busy: boolean
}) {
  const [idRol, setIdRol] = useState<string | number>('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!idRol) {
      setError('Elegí un rol para asignar.')
      return
    }
    setError('')
    await onOk(Number(idRol))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Asignar rol</h2>
            <p className="text-sm text-muted-foreground truncate">
              {usuario.nombreUsuario || usuario.email || usuario.uid}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <SelectAutocomplete
          label="Rol"
          placeholder="Seleccionar rol..."
          value={idRol}
          onChange={setIdRol}
          options={ROL_ASIGNABLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

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
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCog className="size-4" strokeWidth={2} />}
            Asignar
          </button>
        </div>
      </div>
    </div>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}