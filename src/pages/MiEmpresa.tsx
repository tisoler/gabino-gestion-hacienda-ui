import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Building2, Loader2, Save, Plus, AlertCircle, CheckCircle2 } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import type { Empresa } from '../contexts/auth-context'

const ADMIN_KEY = 'adminEmpresaId'

export default function MiEmpresa() {
  const { isSysAdmin, isAnfitrion } = useAuth()

  const canVer = isSysAdmin || isAnfitrion
  const [adminEmpresaId, setAdminEmpresaId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(ADMIN_KEY) || ''
  })

  const { data: empresas } = useSWR<Empresa[]>(canVer ? '/empresas' : null, fetcher)

  // sys-admin elige una empresa puntual (header x-empresa-id vía adminEmpresaId);
  // el resto usa su currentEmpresaId automático.
  const meKey = isSysAdmin
    ? adminEmpresaId
      ? `/empresas/me?emp=${adminEmpresaId}`
      : null
    : '/empresas/me'

  const { data: empresa, isLoading } = useSWR<Empresa | null>(meKey, fetcher)

  const pickEmpresa = (val: string | number) => {
    const id = String(val)
    setAdminEmpresaId(id)
    try {
      window.localStorage.setItem(ADMIN_KEY, id)
    } catch {
      /* noop */
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Mi Empresa</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Datos de la empresa que hospeda los lotes de tus clientes.
        </p>
      </div>

      {isSysAdmin && (
        <section className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Empresa</h2>
          <SelectAutocomplete
            label="Seleccioná una empresa"
            placeholder="Seleccionar empresa..."
            value={adminEmpresaId}
            onChange={pickEmpresa}
            options={(empresas || []).map((e) => ({ value: e.id, label: e.nombre }))}
            clearable
          />
        </section>
      )}

      {!empresa ? (
        <section className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center">
              <Building2 className="size-5" strokeWidth={1.75} />
            </div>
            <h2 className="text-base font-semibold text-foreground">Crear empresa</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            {isSysAdmin
              ? 'Seleccioná una empresa de la lista para ver o editar sus datos.'
              : 'Completá los datos de tu empresa para empezar a operar como anfitrión.'}
          </p>
          {!isSysAdmin && <EmpresaForm key="crear" />}
        </section>
      ) : (
        <EmpresaForm key={`editar-${empresa.id}`} empresa={empresa} />
      )}
    </div>
  )
}

function EmpresaForm({ empresa }: { empresa?: Empresa }) {
  const { isAnfitrion, isSysAdmin, refetchUser } = useAuth()
  const { mutate } = useSWRConfig()

  const creando = !empresa
  const [nombre, setNombre] = useState(empresa?.nombre ?? '')
  const [direccion, setDireccion] = useState(empresa?.direccion ?? '')
  const [telefono, setTelefono] = useState(empresa?.telefono ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [mensaje, setMensaje] = useState('')

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const { data: empresaCreada } = await api.post<Empresa>('/empresas', { nombre, direccion, telefono })
      await refetchUser()
      await mutate('/empresas')
      // Seed determinista: la vista pasa de "crear" a "editar" con la empresa recién creada
      // (sin depender del timing del refetch ni del header x-empresa-id).
      await mutate('/empresas/me', empresaCreada, { revalidate: !empresaCreada })
      setMensaje('Empresa creada correctamente.')
      setResult('ok')
    } catch (err) {
      console.error(err)
      setMensaje(extractMsg(err, 'No se pudo crear la empresa.'))
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresa) return
    setBusy(true)
    setResult(null)
    try {
      await api.patch(`/empresas/${empresa.id}`, { nombre, direccion, telefono })
      setMensaje('Datos guardados correctamente.')
      setResult('ok')
      await mutate('/empresas')
    } catch (err) {
      console.error(err)
      setMensaje(extractMsg(err, 'No se pudieron guardar los datos.'))
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = creando ? handleCrear : handleGuardar
  const puedeEditar = isAnfitrion || isSysAdmin

  return (
    <form onSubmit={handleSubmit} className={creando ? 'mt-4 space-y-4' : 'bg-card border border-border rounded-lg p-6 space-y-4'}>
      {!creando && (
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-md bg-primary-soft text-primary flex items-center justify-center">
            <Building2 className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{empresa.nombre}</h2>
            <p className="text-xs text-muted-foreground">
              {puedeEditar ? 'Podés editar los datos de tu empresa.' : 'Datos de la empresa.'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="nombre" className="text-sm font-medium text-foreground">Nombre</label>
        <input
          id="nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          disabled={!puedeEditar}
          placeholder="Ej: Establecimiento La Esperanza"
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="direccion" className="text-sm font-medium text-foreground">Dirección</label>
        <input
          id="direccion"
          type="text"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          disabled={!puedeEditar}
          placeholder="Ej: Ruta 3 km 45"
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="telefono" className="text-sm font-medium text-foreground">Teléfono</label>
        <input
          id="telefono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          disabled={!puedeEditar}
          placeholder="Ej: +54 9 11 5555 1234"
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {puedeEditar && (
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : creando ? <Plus className="size-4" strokeWidth={2} /> : <Save className="size-4" strokeWidth={2} />}
          {busy ? (creando ? 'Creando…' : 'Guardando…') : creando ? 'Crear empresa' : 'Guardar cambios'}
        </button>
      )}

      {result && (
        <div
          role={result === 'ok' ? 'status' : 'alert'}
          className={`p-3 rounded-md text-sm flex items-center gap-2.5 ${
            result === 'ok'
              ? 'bg-success-soft border border-success/20 text-success'
              : 'bg-destructive-soft border border-destructive/20 text-destructive'
          }`}
        >
          {result === 'ok' ? <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} /> : <AlertCircle className="size-4 shrink-0" strokeWidth={2} />}
          <span>{mensaje}</span>
        </div>
      )}
    </form>
  )
}

function extractMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}