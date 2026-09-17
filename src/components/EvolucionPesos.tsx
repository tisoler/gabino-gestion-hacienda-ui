import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PALETA_LOTE } from '../constantes'
import { fmtFechaCorta, fmtPeso, type PartidaDto, type PesajeDto } from '../lib/pesos'

interface AnimalMin {
  id: number
  nAnimal: number | null
  caravana: string | null
  idPartida: number | null
  estado: string
}

type Serie = 'total' | 'promedio' | 'individuales'

/** Color estable por índice de partida/animal. */
const colorDe = (i: number) => PALETA_LOTE[i % PALETA_LOTE.length]

/**
 * Gráfica de evolución de pesos del lote (líneas), con 3 series seleccionables:
 *  - "total": una línea del lote si hay 1 partida, o una línea por partida si
 *    hay varias (cada partida con su peso total por fecha).
 *  - "promedio": siempre una línea del lote (todos los animales) + una por
 *    partida cuando hay varias.
 *  - "individuales": una línea por animal.
 */
export function EvolucionPesos({
  animales,
  pesajes,
  partidas,
}: {
  animales: AnimalMin[]
  pesajes: PesajeDto[]
  partidas: PartidaDto[]
}) {
  const [activas, setActivas] = useState<Serie[]>(['total'])
  // Gráficas sin muertos (siempre). "Incluir entregados" suma los salidos.
  const [incluirEntregados, setIncluirEntregados] = useState(false)
  const multi = partidas.length > 1

  const incluidos = useMemo(
    () =>
      animales.filter(
        (a) => a.estado !== 'muerto' && (incluirEntregados || a.estado !== 'salido'),
      ),
    [animales, incluirEntregados],
  )
  const idsIncluidos = useMemo(() => new Set(incluidos.map((a) => a.id)), [incluidos])
  const pesajesVisibles = useMemo(
    () => pesajes.filter((p) => idsIncluidos.has(p.animalId)),
    [pesajes, idsIncluidos],
  )

  const fechas = useMemo(() => {
    const set = new Set<string>()
    for (const p of pesajesVisibles) set.add(p.fecha)
    return Array.from(set).sort()
  }, [pesajesVisibles])

  const animalById = useMemo(
    () => new Map(incluidos.map((a) => [a.id, a])),
    [incluidos],
  )

  // Pivot por fecha: lote total/promedio, por partida total/promedio, por animal.
  const data = useMemo(() => {
    return fechas.map((fecha) => {
      const delDia = pesajesVisibles.filter((p) => p.fecha === fecha)
      const loteSuma = delDia.reduce((acc, p) => acc + Number(p.peso), 0)
      const row: Record<string, number | string> = {
        fecha,
        totalLote: round2(loteSuma),
        promLote: delDia.length ? round2(loteSuma / delDia.length) : 0,
      }
      // Por partida (total y promedio).
      for (const pt of partidas) {
        const idsPartida = new Set(
          incluidos.filter((a) => a.idPartida === pt.id).map((a) => a.id),
        )
        const dePartida = delDia.filter((p) => idsPartida.has(p.animalId))
        const suma = dePartida.reduce((acc, p) => acc + Number(p.peso), 0)
        row[`totalP_${pt.id}`] = dePartida.length ? round2(suma) : (null as unknown as number)
        row[`promP_${pt.id}`] = dePartida.length ? round2(suma / dePartida.length) : (null as unknown as number)
      }
      // Por animal.
      for (const p of delDia) {
        const a = animalById.get(p.animalId)
        if (a) row[`a_${a.id}`] = Number(p.peso)
      }
      return row
    })
  }, [fechas, pesajesVisibles, partidas, incluidos, animalById])

  const toggle = (s: Serie) =>
    setActivas((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )

  if (fechas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Todavía no hay pesajes cargados para graficar.
      </p>
    )
  }

  const checkbox = (s: Serie, label: string) => (
    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
      <input
        type="checkbox"
        checked={activas.includes(s)}
        onChange={() => toggle(s)}
        className="size-3.5 accent-[var(--color-primary)] cursor-pointer"
      />
      {label}
    </label>
  )

  const nombreDeAnimal = (id: number) => {
    const a = animalById.get(id)
    if (!a) return `#${id}`
    return a.caravana ? `Car. ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`
  }
  const nombrePartida = (id: number) => partidas.find((p) => p.id === id)?.nombre ?? `Partida`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {checkbox('total', multi ? 'Peso total por partida' : 'Peso total del lote')}
        {checkbox('promedio', multi ? 'Promedio (lote y partidas)' : 'Peso promedio')}
        {checkbox('individuales', 'Pesos individuales')}
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={incluirEntregados}
            onChange={(e) => setIncluirEntregados(e.target.checked)}
            className="size-3.5 accent-[var(--color-primary)] cursor-pointer"
          />
          Incluir entregados
        </label>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="fecha"
              tickFormatter={fmtFechaCorta}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              stroke="var(--color-border)"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              stroke="var(--color-border)"
              width={48}
              tickFormatter={(v: number) => fmtPeso(v)}
            />
            <Tooltip
              formatter={(value: number | string | readonly (number | string)[] | undefined, name: number | string | undefined) => {
                const key = String(name)
                const num = typeof value === 'number' ? value : Number(Array.isArray(value) ? value[0] : value)
                return [`${fmtPeso(num)} kg`, etiquetaDeClave(key, nombrePartida, nombreDeAnimal)]
              }}
              labelFormatter={(label: React.ReactNode) => fmtFechaCorta(String(label))}
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* TOTAL: lote (1 partida) o por partida (varias) */}
            {activas.includes('total') && !multi && (
              <Line type="monotone" dataKey="totalLote" name="totalLote" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            )}
            {activas.includes('total') &&
              multi &&
              partidas.map((pt, i) => (
                <Line key={`t${pt.id}`} type="monotone" dataKey={`totalP_${pt.id}`} name={`totalP_${pt.id}`} stroke={colorDe(i)} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              ))}

            {/* PROMEDIO: lote siempre; por partida si hay varias */}
            {activas.includes('promedio') && (
              <Line type="monotone" dataKey="promLote" name="promLote" stroke="var(--color-info)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} connectNulls />
            )}
            {activas.includes('promedio') &&
              multi &&
              partidas.map((pt, i) => (
                <Line key={`p${pt.id}`} type="monotone" dataKey={`promP_${pt.id}`} name={`promP_${pt.id}`} stroke={colorDe(i)} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              ))}

            {/* INDIVIDUALES: una línea por animal */}
            {activas.includes('individuales') &&
              incluidos.map((a, i) => (
                <Line key={a.id} type="monotone" dataKey={`a_${a.id}`} name={`a_${a.id}`} stroke={colorDe(i)} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Convierte la dataKey interna en una etiqueta legenda/tooltip. */
function etiquetaDeClave(
  key: string,
  nombrePartida: (id: number) => string,
  nombreDeAnimal: (id: number) => string,
): string {
  if (key === 'totalLote') return 'Lote (total)'
  if (key === 'promLote') return 'Lote (promedio)'
  const mP = key.match(/^totalP_(\d+)$/)
  if (mP) return `${nombrePartida(Number(mP[1]))} (total)`
  const mPr = key.match(/^promP_(\d+)$/)
  if (mPr) return `${nombrePartida(Number(mPr[1]))} (promedio)`
  const mA = key.match(/^a_(\d+)$/)
  if (mA) return nombreDeAnimal(Number(mA[1]))
  return key
}
