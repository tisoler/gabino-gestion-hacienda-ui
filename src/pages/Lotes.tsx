import useSWR from 'swr'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, Loader2 } from 'lucide-react'
import { fetcher } from '../lib/api'
import { Table } from '../components/Table'
import { CorralMapa } from '../components/CorralMapa'

export interface LoteResumen {
  id: number
  nombre: string
  descripcion: string | null
  fecha: string | null
  idCliente: string | null
  nombreCliente: string | null
  idCorral: number | null
  corralNombre: string | null
  color: string | null
  nAnimales: number
}

const fmtFecha = (f: string | null): string => {
  if (!f) return '—'
  const d = new Date(f + (f.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR')
}

export default function Lotes() {
  const navigate = useNavigate()

  const { data: lotes, isLoading } = useSWR<LoteResumen[]>('/lotes', fetcher, {
    revalidateOnFocus: false,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Lotes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Partidas de animales hospedadas en tu empresa.
          </p>
        </div>
        <button
          onClick={() => navigate('/lotes/nueva')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="size-4" strokeWidth={2} /> Nuevo lote
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_600px] items-start">
        <div className="min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
            </div>
          ) : (
            <Table<LoteResumen>
              data={lotes || []}
              emptyMessage="No hay lotes cargados todavía."
              columns={[
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
                { header: 'Fecha', accessor: (l) => <span className="text-muted-foreground">{fmtFecha(l.fecha)}</span> },
                { header: 'Cliente', accessor: (l) => <span className="text-muted-foreground">{l.nombreCliente || '—'}</span> },
                {
                  header: 'Corral',
                  accessor: (l) =>
                    l.corralNombre ? (
                      <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-2 py-0.5">
                        {l.corralNombre}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin corral</span>
                    ),
                },
                {
                  header: 'Animales',
                  accessor: (l) => (
                    <span className="inline-flex text-xs font-semibold text-primary bg-primary-soft rounded-full px-2 py-0.5">
                      {l.nAnimales}
                    </span>
                  ),
                },
                {
                  header: '',
                  accessor: (l) => (
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => navigate(`/lotes/${l.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-soft hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                      >
                        Ver / Editar <ArrowRight className="size-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        <CorralMapa />
      </div>
    </div>
  )
}