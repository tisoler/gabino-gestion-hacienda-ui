import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useSWR from 'swr'
import { AlertCircle, Loader2, LogOut } from 'lucide-react'
import { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import SelectAutocomplete from '../components/SelectAutocomplete'
import { Table } from '../components/Table'
import { SALIDA_TIPO_LABELS, type SalidaView } from '../lib/salidas'

const fmtFecha = (f: string): string => {
  if (!f) return '—'
  const d = new Date(f.length === 10 ? f + 'T00:00:00' : f)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR')
}
const fmtKg = (n: number): string => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

const etiquetaAnimal = (a: { nAnimal: number | null; caravana: string | null }): string =>
  a.caravana ? `Car. ${a.caravana}` : `Animal ${a.nAnimal ?? ''}`

interface Filtros {
  cliente: string
  corral: string
  lote: string
  partida: string
  desde: string
  hasta: string
}

export default function Salidas() {
  const { permisos, isSysAdmin } = useAuth()
  const puedeVer = permisos.includes('lectura:salida')
  const [params] = useSearchParams()
  const [filtros, setFiltros] = useState<Filtros>({
    cliente: '',
    corral: '',
    lote: params.get('lote') ?? '',
    partida: '',
    desde: '',
    hasta: '',
  })

  const { data: salidas, isLoading } = useSWR<SalidaView[]>(
    puedeVer ? '/salidas' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const all = useMemo(() => salidas ?? [], [salidas])

  const set = (patch: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...patch }))

  const coincide = (s: SalidaView, f: Filtros, ignorar?: keyof Filtros) => {
    if (ignorar !== 'cliente' && f.cliente && s.cliente?.id !== f.cliente) return false
    if (ignorar !== 'corral' && f.corral && s.corral?.id !== Number(f.corral)) return false
    if (ignorar !== 'lote' && f.lote && s.lote.id !== Number(f.lote)) return false
    if (ignorar !== 'partida' && f.partida && s.partida?.id !== Number(f.partida)) return false
    return true
  }

  const filtradas = useMemo(
    () =>
      all.filter(
        (s) =>
          coincide(s, filtros) &&
          (!filtros.desde || s.fecha >= filtros.desde) &&
          (!filtros.hasta || s.fecha <= filtros.hasta),
      ),
    [all, filtros],
  )

  // Opciones encadenadas: cada selector se filtra por los DEMÁS (sin fechas).
  const opcionesClientes = useMemo(() => {
    const base = all.filter((s) => coincide(s, filtros, 'cliente'))
    const map = new Map<string, string>()
    for (const s of base) if (s.cliente) map.set(s.cliente.id, s.cliente.nombre ?? s.cliente.id)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const opcionesCorrales = useMemo(() => {
    const base = all.filter((s) => coincide(s, filtros, 'corral'))
    const map = new Map<number, string>()
    for (const s of base) if (s.corral) map.set(s.corral.id, s.corral.nombre)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const opcionesLotes = useMemo(() => {
    const base = all.filter((s) => coincide(s, filtros, 'lote'))
    const map = new Map<number, string>()
    for (const s of base) map.set(s.lote.id, s.lote.nombre)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const opcionesPartidas = useMemo(() => {
    const base = all.filter((s) => coincide(s, filtros, 'partida'))
    const map = new Map<number, string>()
    for (const s of base) if (s.partida) map.set(s.partida.id, s.partida.nombre)
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [all, filtros])

  const tieneFiltros = !!(filtros.cliente || filtros.corral || filtros.lote || filtros.partida || filtros.desde || filtros.hasta)

  if (!puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-semibold text-foreground">Acceso Denegado</h2>
        <p className="text-sm text-muted-foreground mt-1.5">No tenés permisos para ver salidas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Salidas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de salidas de animales (egresos), con la diferencia de peso del grupo.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <section className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectAutocomplete
          label="Cliente"
          placeholder="Todos"
          value={filtros.cliente}
          onChange={(v) => set({ cliente: String(v) })}
          options={opcionesClientes}
          clearable
        />
        <SelectAutocomplete
          label="Corral"
          placeholder="Todos"
          value={filtros.corral}
          onChange={(v) => set({ corral: String(v) })}
          options={opcionesCorrales}
          clearable
        />
        <SelectAutocomplete
          label="Lote"
          placeholder="Todos"
          value={filtros.lote}
          onChange={(v) => set({ lote: String(v) })}
          options={opcionesLotes}
          clearable
        />
        <SelectAutocomplete
          label="Partida"
          placeholder="Todas"
          value={filtros.partida}
          onChange={(v) => set({ partida: String(v) })}
          options={opcionesPartidas}
          clearable
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Desde</label>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => set({ desde: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Hasta</label>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => set({ hasta: e.target.value })}
            className="px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors w-full"
          />
        </div>
        {tieneFiltros && (
          <div className="flex items-end">
            <button
              onClick={() => set({ cliente: '', corral: '', lote: '', partida: '', desde: '', hasta: '' })}
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="size-8 text-primary animate-spin" strokeWidth={1.75} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {all.length === 0 ? 'Todavía no hay salidas registradas.' : 'Sin resultados para los filtros.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filtradas.map((s) => (
              <div key={s.id} className="premium-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <LogOut className="size-4" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {s.lote.nombre} · Corral: {s.corral?.nombre ?? '—'} · {SALIDA_TIPO_LABELS[s.tipo] ?? s.tipo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtFecha(s.fecha)} · {s.nAnimales} animales ·{' '}
                        {s.partida ? `${s.partida.nombre} · ` : ''}
                        {s.cliente?.nombre ?? '—'}
                      </p>
                    </div>
                  </div>
                  {isSysAdmin && s.empresa && (
                    <span className="text-xs text-muted-foreground shrink-0">{s.empresa.nombre}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Peso inicial</span>
                  <span className="text-foreground tabular-nums">{fmtKg(s.pesoInicialTotal)} kg</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Peso final</span>
                  <span className="text-foreground tabular-nums">{fmtKg(s.pesoFinalTotal)} kg</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">Diferencia del grupo</span>
                  <span
                    className={`tabular-nums font-semibold ${s.diferenciaKg >= 0 ? 'text-success' : 'text-destructive'}`}
                  >
                    {s.diferenciaKg >= 0 ? '+' : ''}
                    {fmtKg(s.diferenciaKg)} kg
                  </span>
                </div>
                <div className="grid gap-1">
                  {s.animales.map((a) => (
                    <div key={a.animalId} className="flex items-center justify-between gap-2 text-xs border border-border rounded-md px-2.5 py-1.5">
                      <span className="text-foreground truncate">{etiquetaAnimal(a)}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtKg(a.pesoInicial ?? 0)} → {fmtKg(a.pesoFinal)} kg{' '}
                        <span className={a.diferenciaKg >= 0 ? 'text-success' : 'text-destructive'}>
                          ({a.diferenciaKg >= 0 ? '+' : ''}
                          {fmtKg(a.diferenciaKg)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden sm:block">
            <Table<SalidaView>
              data={filtradas}
              columns={[
                {
                  header: 'Fecha',
                  accessor: (s) => <span className="text-muted-foreground">{fmtFecha(s.fecha)}</span>,
                },
                {
                  header: 'Lote',
                  accessor: (s) => (
                    <div>
                      <p className="font-medium text-foreground">{s.lote.nombre}</p>
                    </div>
                  ),
                },
                {
                  header: 'Corral',
                  accessor: (s) => (
                    <div>
                      {s.corral && <p className="text-xs text-muted-foreground">{s.corral.nombre}</p>}
                    </div>
                  ),
                },
                {
                  header: 'Tipo',
                  accessor: (s) => (
                    <span className="text-muted-foreground">
                      {SALIDA_TIPO_LABELS[s.tipo] ?? s.tipo}
                      {s.partida ? ` · ${s.partida.nombre}` : ''}
                    </span>
                  ),
                },
                {
                  header: 'Animales',
                  accessor: (s) => <span className="text-muted-foreground tabular-nums">{s.nAnimales}</span>,
                },
                {
                  header: 'Peso inicial',
                  accessor: (s) => <span className="text-muted-foreground tabular-nums">{fmtKg(s.pesoInicialTotal)} kg</span>,
                },
                {
                  header: 'Peso final',
                  accessor: (s) => <span className="text-foreground tabular-nums">{fmtKg(s.pesoFinalTotal)} kg</span>,
                },
                {
                  header: 'Diferencia',
                  accessor: (s) => (
                    <span className={`tabular-nums font-semibold ${s.diferenciaKg >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {s.diferenciaKg >= 0 ? '+' : ''}
                      {fmtKg(s.diferenciaKg)} kg
                    </span>
                  ),
                },
                {
                  header: 'Animales que salieron',
                  accessor: (s) => (
                    <div className="space-y-0.5">
                      {s.animales.map((a) => (
                        <div key={a.animalId} className="text-xs">
                          <span className="text-foreground">{etiquetaAnimal(a)}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {' '}
                            — {fmtKg(a.pesoInicial ?? 0)} → {fmtKg(a.pesoFinal)} kg
                            <span className={a.diferenciaKg >= 0 ? 'text-success' : 'text-destructive'}>
                              {' '}
                              ({a.diferenciaKg >= 0 ? '+' : ''}
                              {fmtKg(a.diferenciaKg)})
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ),
                },
                ...(isSysAdmin
                  ? [
                    {
                      header: 'Empresa',
                      accessor: (s: SalidaView) => (
                        <span className="text-muted-foreground">{s.empresa?.nombre ?? '—'}</span>
                      ),
                    },
                  ]
                  : []),
              ]}
            />
          </div>
        </>
      )}
    </div>
  )
}