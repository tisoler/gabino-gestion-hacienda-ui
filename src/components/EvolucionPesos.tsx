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
import { fmtFechaCorta, fmtPeso, type PesajeDto } from '../lib/pesos'

interface AnimalMin {
  id: number
  nAnimal: number | null
  caravana: string | null
}

type Serie = 'total' | 'promedio' | 'individuales'

/**
 * Gráfica de evolución de pesos del lote (líneas). Tres series seleccionables
 * (más de una a la vez): peso total del lote (por defecto), peso promedio de
 * los animales y pesos individuales (una línea por animal).
 */
export function EvolucionPesos({
  animales,
  pesajes,
}: {
  animales: AnimalMin[]
  pesajes: PesajeDto[]
}) {
  const [activas, setActivas] = useState<Serie[]>(['total'])

  const fechas = useMemo(() => {
    const set = new Set<string>()
    for (const p of pesajes) set.add(p.fecha)
    return Array.from(set).sort()
  }, [pesajes])

  // Pivot: por fecha → { total, promedio, [a_<id>] }.
  const data = useMemo(() => {
    const porFecha = new Map<string, { suma: number; n: number; porAnimal: Map<number, number> }>()
    for (const p of pesajes) {
      let d = porFecha.get(p.fecha)
      if (!d) {
        d = { suma: 0, n: 0, porAnimal: new Map() }
        porFecha.set(p.fecha, d)
      }
      d.suma += Number(p.peso)
      d.n += 1
      d.porAnimal.set(p.animalId, Number(p.peso))
    }
    return fechas.map((fecha) => {
      const d = porFecha.get(fecha)!
      const row: Record<string, number | string> = {
        fecha,
        total: Math.round(d.suma * 100) / 100,
        promedio: d.n ? Math.round((d.suma / d.n) * 100) / 100 : 0,
      }
      for (const a of animales) {
        const v = d.porAnimal.get(a.id)
        if (v != null) row[`a_${a.id}`] = v
      }
      return row
    })
  }, [fechas, pesajes, animales])

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {checkbox('total', 'Peso total del lote')}
        {checkbox('promedio', 'Peso promedio')}
        {checkbox('individuales', 'Pesos individuales')}
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
                const a = animales.find((x) => `a_${x.id}` === key)
                const label = a
                  ? a.caravana
                    ? `Caravana ${a.caravana}`
                    : `Animal ${a.nAnimal ?? a.id}`
                  : key === 'total'
                    ? 'Peso total'
                    : 'Promedio'
                const num =
                  typeof value === 'number' ? value : Number(Array.isArray(value) ? value[0] : value)
                return [`${fmtPeso(num)} kg`, label]
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
            {activas.includes('total') && (
              <Line
                type="monotone"
                dataKey="total"
                name="total"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            )}
            {activas.includes('promedio') && (
              <Line
                type="monotone"
                dataKey="promedio"
                name="promedio"
                stroke="var(--color-info)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 2.5 }}
              />
            )}
            {activas.includes('individuales') &&
              animales.map((a, i) => (
                <Line
                  key={a.id}
                  type="monotone"
                  dataKey={`a_${a.id}`}
                  name={`a_${a.id}`}
                  stroke={PALETA_LOTE[i % PALETA_LOTE.length]}
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
