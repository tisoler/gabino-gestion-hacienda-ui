import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { AlertCircle, Loader2, Plus, Power, PowerOff, History, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { DietaFormModal } from '../components/DietaFormModal'
import { CalculadoraDietas } from '../components/CalculadoraDietas'
import type { DietaView } from '../lib/dietas'

const fmtFecha = (f: string | null): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}

const extractMsg = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

/**
 * Módulo de alimentación. Izquierda: dietas (el lector ve sólo las activas; el
 * que tiene escritura:dieta ve todas, puede activar/desactivar y versionar).
 * Derecha: calculadora de raciones.
 */
export default function Dietas() {
  const { permisos, isSysAdmin } = useAuth()
  const { mutate } = useSWRConfig()
  const puedeVer = permisos.includes('lectura:dieta')
  const puedeEscribir = permisos.includes('escritura:dieta')

  const [formOpen, setFormOpen] = useState(false)
  const [inicial, setInicial] = useState<
    | { nombre: string; ingredientes: { idIngrediente: number; porcentaje: number }[]; idEmpresa: number | null }
    | undefined
  >(undefined)
  const [historialDe, setHistorialDe] = useState<DietaView | null>(null)
  const [error, setError] = useState('')

  // Empresas para que el sys-admin elija el alcance (Global o una empresa).
  const { data: empresas } = useSWR<{ id: number; nombre: string }[]>(
    isSysAdmin ? '/empresas' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const listKey = puedeEscribir ? '/dietas?estado=todas' : '/dietas'
  const { data: dietas, isLoading } = useSWR<DietaView[]>(
    puedeVer ? listKey : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const activas = (dietas ?? []).filter((d) => d.activa)
  // Una dieta global sólo la gestiona el sys-admin; las de empresa, su dueño.
  const puedeGestionar = (d: DietaView) => puedeEscribir && (isSysAdmin || !d.global)

  const abrirNueva = () => {
    setInicial(undefined)
    setFormOpen(true)
  }
  const abrirNuevaVersion = (d: DietaView) => {
    setInicial({ nombre: d.nombre, ingredientes: d.ingredientes, idEmpresa: d.idEmpresa })
    setFormOpen(true)
  }

  const toggleActiva = async (d: DietaView) => {
    setError('')
    try {
      await api.patch(`/dietas/${d.id}/activo`, { activa: !d.activa })
      await mutate(listKey)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo cambiar el estado de la dieta.'))
    }
  }

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver dietas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dietas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Composiciones de alimentación por proporciones (100%).
          </p>
        </div>
        {puedeEscribir && (
          <button
            onClick={abrirNueva}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="size-4" strokeWidth={2} /> Nueva dieta
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md flex items-center gap-2.5">
          <AlertCircle className="size-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] items-start">
        {/* Lista de dietas */}
        <div className="min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : !dietas || dietas.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no hay dietas. {puedeEscribir ? 'Creá la primera.' : ''}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {dietas.map((d) => (
                <div
                  key={`${d.id}-v${d.version}`}
                  className={`premium-card p-4 space-y-3 ${!d.activa ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">{d.nombre}</h3>
                        {d.global && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary-soft rounded-full px-1.5 py-0.5">
                            Global
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                          v{d.version}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {d.activa ? 'Activa' : 'Inactiva'} · {fmtFecha(d.actualizadaEn)}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1">
                    {d.ingredientes.map((ing) => (
                      <li key={ing.idIngrediente} className="flex items-center justify-between text-sm">
                        <span className="text-foreground truncate">{ing.nombre}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{ing.porcentaje}%</span>
                      </li>
                    ))}
                  </ul>

                  {puedeGestionar(d) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        onClick={() => abrirNuevaVersion(d)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
                      >
                        <Plus className="size-3.5" strokeWidth={2} /> Nueva versión
                      </button>
                      <button
                        onClick={() => toggleActiva(d)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                          d.activa
                            ? 'border-border text-muted-foreground hover:bg-destructive-soft hover:text-destructive'
                            : 'border-success/40 text-success hover:bg-success-soft'
                        }`}
                      >
                        {d.activa ? <PowerOff className="size-3.5" strokeWidth={2} /> : <Power className="size-3.5" strokeWidth={2} />}
                        {d.activa ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => setHistorialDe(d)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        <History className="size-3.5" strokeWidth={2} /> Historial
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calculadora */}
        <CalculadoraDietas dietas={activas} />
      </div>

      {formOpen && (
        <DietaFormModal
          inicial={inicial}
          empresas={empresas ?? []}
          puedeElegirAlcance={isSysAdmin}
          onClose={() => setFormOpen(false)}
          onOk={async () => {
            await mutate(listKey)
          }}
        />
      )}

      {historialDe && (
        <HistorialModal dieta={historialDe} onClose={() => setHistorialDe(null)} />
      )}
    </div>
  )
}

/** Lista de versiones (histórico) de una dieta. */
function HistorialModal({ dieta, onClose }: { dieta: DietaView; onClose: () => void }) {
  const { data, isLoading } = useSWR<DietaView[]>(`/dietas/${dieta.id}/versiones`, fetcher)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Historial · {dieta.nombre}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent cursor-pointer" aria-label="Cerrar">
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-6 text-primary animate-spin" strokeWidth={1.75} />
          </div>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((v) => (
              <div key={v.version} className="border border-border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Versión {v.version}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                      v.activa ? 'text-success bg-success-soft' : 'text-muted-foreground bg-muted'
                    }`}
                  >
                    {v.activa ? 'Vigente' : 'Histórica'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{fmtFecha(v.actualizadaEn)}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {v.ingredientes.map((ing) => (
                    <li key={ing.idIngrediente} className="text-xs bg-muted rounded-full px-2 py-0.5 text-foreground">
                      {ing.nombre} · {ing.porcentaje}%
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
