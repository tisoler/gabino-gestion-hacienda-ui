import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, Stethoscope, Utensils } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { Table } from '../components/Table'
import { CorralMapa } from '../components/CorralMapa'
import { AlimentarModal } from '../components/AlimentarModal'
import { TratamientoLoteModal } from '../components/TratamientoLoteModal'

export interface LoteResumen {
  id: number
  idEmpresa: number
  nombreEmpresa: string | null
  nombre: string
  descripcion: string | null
  fecha: string | null
  idCliente: string | null
  nombreCliente: string | null
  idCorral: number | null
  corralNombre: string | null
  color: string | null
  nAnimales: number
  /** Vivos (sano/enfermo). Con animales pero sin vivos = lote cerrado. */
  nVivos: number
  createdAt: string
}

const fmtFecha = (f: string | null): string => {
  if (!f) return '—'
  const d = new Date(f + (f.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR')
}

export default function Lotes() {
  const navigate = useNavigate()
  const { permisos, isCliente } = useAuth()
  const { mutate } = useSWRConfig()
  // El cliente (sin escritura:lote) sólo puede VER; no crea ni entra a editar.
  const puedeEscribir = permisos.includes('escritura:lote')
  const puedeAlimentar = permisos.includes('escritura:alimento')
  const puedeTratar = permisos.includes('escritura:veterinaria')
  // Los que pueden mover arrastrando pueden colapsar el panel de corrales a
  // 1 columna para darle más ancho a la tabla de lotes. Por defecto expandido.
  const [corralesColapsado, setCorralesColapsado] = useState(false)
  const [alimentarOpen, setAlimentarOpen] = useState(false)
  const [alimentarCorralId, setAlimentarCorralId] = useState<number | undefined>(undefined)
  const [tratarLote, setTratarLote] = useState<LoteResumen | null>(null)
  const panelColapsado = !puedeEscribir || corralesColapsado

  const { data: lotes, isLoading } = useSWR<LoteResumen[]>('/lotes', fetcher, {
    revalidateOnFocus: false,
  })

  // Activos: en algún corral o sin animales (recién creados). Anteriores:
  // con animales pero sin vivos (todos entregados y/o muertos).
  const { activos, anteriores } = useMemo(() => {
    const acts: LoteResumen[] = []
    const ants: LoteResumen[] = []
    for (const l of lotes ?? []) {
      if (l.nAnimales > 0 && (l.nVivos ?? 0) === 0) ants.push(l)
      else acts.push(l)
    }
    const natural = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true })
    acts.sort((a, b) => {
      if ((a.corralNombre == null) !== (b.corralNombre == null)) return a.corralNombre == null ? 1 : -1
      if (a.corralNombre && b.corralNombre) {
        const c = natural(a.corralNombre, b.corralNombre)
        if (c !== 0) return c
      }
      return natural(a.nombre, b.nombre)
    })
    ants.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    return { activos: acts, anteriores: ants }
  }, [lotes])

  const columnas: { header: string; accessor: (l: LoteResumen) => ReactNode }[] = [
    {
      header: 'Lote',
      accessor: (l) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 rounded-full shrink-0 border border-border"
              style={{ backgroundColor: l.color ?? '#57534E' }}
              aria-hidden
            />
            <p className="font-medium text-foreground truncate">{l.nombre}</p>
          </div>
          {l.descripcion && (
            <p className="text-xs text-muted-foreground truncate max-w-xs">{l.descripcion}</p>
          )}
        </div>
      ),
    },
    // Un cliente puede tener lotes de varias empresas; el resto ve
    // siempre la suya, así que la columna "Empresa" sólo aplica al
    // cliente (simétrico a ocultarle la columna "Cliente").
    ...(isCliente
      ? [
        {
          header: 'Empresa',
          accessor: (l: LoteResumen) => (
            <span className="text-muted-foreground">{l.nombreEmpresa || '—'}</span>
          ),
        },
      ]
      : []),
    { header: 'Fecha', accessor: (l) => <span className="text-muted-foreground">{fmtFecha(l.fecha)}</span> },
    // El cliente sólo ve sus lotes: la columna "Cliente" es él mismo.
    ...(!isCliente
      ? [
                    {
                      header: 'Cliente',
                      accessor: (l: LoteResumen) => (
                        <span className="inline-block min-w-28 text-muted-foreground">{l.nombreCliente || '—'}</span>
                      ),
                    },
      ]
      : []),
    {
      header: 'Corral',
                  accessor: (l) =>
                    l.corralNombre ? (
                      <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-px">
                        {l.corralNombre}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin corral</span>
                    ),
    },
    {
      header: 'Animales',
                  accessor: (l) => (
                    <span className="inline-flex text-[11px] font-semibold text-primary bg-primary-soft rounded-full px-1.5 py-px">
                      {l.nAnimales}
                    </span>
                  ),
    },
    {
      header: '',
      accessor: (l) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {puedeTratar && (
                        <button
                          onClick={() => setTratarLote(l)}
                          title="Aplicar tratamiento al lote"
                          className="p-2 rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                        >
                          <Stethoscope className="size-4" strokeWidth={1.75} />
                        </button>
                      )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {isCliente ? 'Mis lotes' : 'Lotes'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Partidas de animales y su ubicación en corrales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeAlimentar && (
            <button
              onClick={() => setAlimentarOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
            >
              <Utensils className="size-4" strokeWidth={2} /> Alimentar
            </button>
          )}
          {puedeEscribir && (
            <button
              onClick={() => navigate('/lotes/nueva')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Plus className="size-4" strokeWidth={2} /> Nuevo lote
            </button>
          )}
        </div>
      </div>

      <div
        className={
          panelColapsado
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px] items-start'
            : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_560px] 2xl:grid-cols-[minmax(0,1fr)_700px] items-start'
        }
      >
        <div className="min-w-0 flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[480px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : (
            <>
              <section className="flex-[7] min-h-0 flex flex-col gap-2">
                <h2 className="text-base font-semibold text-foreground tracking-tight shrink-0">
                  Lotes activos <span className="text-sm font-normal text-muted-foreground">({activos.length})</span>
                </h2>
                <div className="flex-1 min-h-0 overflow-y-auto max-2xl:[&_th]:text-[10px] max-2xl:[&_td]:text-[13px]">
                  <Table<LoteResumen>
                    data={activos}
                    emptyMessage="No hay lotes activos."
                    onRowClick={(l) => navigate(`/lotes/${l.id}`)}
                    columns={columnas}
                  />
                </div>
              </section>
              <section className="flex-[3] min-h-0 flex flex-col gap-2">
                <h2 className="text-base font-semibold text-foreground tracking-tight shrink-0">
                  Lotes anteriores <span className="text-sm font-normal text-muted-foreground">({anteriores.length})</span>
                </h2>
                <div className="flex-1 min-h-0 overflow-y-auto max-2xl:[&_th]:text-[10px] max-2xl:[&_td]:text-[13px]">
                  <Table<LoteResumen>
                    data={anteriores}
                    emptyMessage="Sin lotes anteriores."
                    onRowClick={(l) => navigate(`/lotes/${l.id}`)}
                    columns={columnas}
                  />
                </div>
              </section>
            </>
          )}
        </div>

        <CorralMapa
          puedeColapsar={puedeEscribir}
          colapsado={panelColapsado}
          onToggleColapso={() => setCorralesColapsado((v) => !v)}
          puedeAlimentar={puedeAlimentar}
          onAlimentar={(corralId) => {
            setAlimentarCorralId(corralId)
            setAlimentarOpen(true)
          }}
        />
      </div>

      {alimentarOpen && (
        <AlimentarModal
          initialCorralId={alimentarCorralId}
          onClose={() => {
            setAlimentarOpen(false)
            setAlimentarCorralId(undefined)
          }}
          onSaved={async () => {
            await mutate('/corrales/mapa')
            await mutate(
              (key) => typeof key === 'string' && key.startsWith('/alimentaciones'),
              undefined,
              { revalidate: true },
            )
          }}
        />
      )}

      {tratarLote && (
        <TratamientoLoteModal
          loteId={tratarLote.id}
          loteNombre={tratarLote.nombre}
          onClose={() => setTratarLote(null)}
          onGuardado={async () => {
            await mutate('/lotes')
          }}
        />
      )}
    </div>
  )
}