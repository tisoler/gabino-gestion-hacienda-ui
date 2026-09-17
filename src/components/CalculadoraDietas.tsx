import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import { fmtKg, kgIngrediente, type DietaView } from '../lib/dietas'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

/**
 * Calculadora de raciones: elige una dieta vigente y una cantidad a preparar
 * (default 2500 kg) y desglosa los kg de cada ingrediente según el %.
 */
export function CalculadoraDietas({ dietas }: { dietas: DietaView[] }) {
  const [idDieta, setIdDieta] = useState<string | number>('')
  const [cantidad, setCantidad] = useState('2500')

  const dieta = useMemo(
    () => dietas.find((d) => d.id === Number(idDieta)) ?? null,
    [dietas, idDieta],
  )
  const n = parseFloat(cantidad.replace(',', '.'))
  const cantidadOk = !isNaN(n) && n > 0

  return (
    <section className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
          <Calculator className="size-4" strokeWidth={1.75} />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Calculadora de raciones</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Dieta</label>
          <select
            value={idDieta}
            onChange={(e) => setIdDieta(e.target.value ? Number(e.target.value) : '')}
            className={`${inputCls} w-full cursor-pointer`}
          >
            <option value="">Elegir dieta...</option>
            {dietas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre} (v{d.version})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Cantidad a preparar (kg)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      {!dieta ? (
        <p className="text-xs text-muted-foreground">
          Elegí una dieta para ver el desglose de ingredientes.
        </p>
      ) : !cantidadOk ? (
        <p className="text-xs text-muted-foreground">Ingresá una cantidad válida.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            <span>Ingrediente</span>
            <span>Kg</span>
          </div>
          <div className="divide-y divide-border">
            {dieta.ingredientes.map((ing) => (
              <div key={ing.idIngrediente} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-foreground">
                  {ing.nombre}{' '}
                  <span className="text-xs text-muted-foreground">({ing.porcentaje}%)</span>
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {fmtKg(kgIngrediente(n, ing.porcentaje))} kg
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/40">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-semibold text-foreground tabular-nums">{fmtKg(n)} kg</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
