import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  round2,
  hoyIso,
  fmtPeso,
  type CargarPesajesPayload,
} from '../lib/pesos'

export interface EditorAnimalRow {
  id: number
  nAnimal: number | null
  caravana: string | null
  /** Peso ya cargado para esa fecha (para prellenar). */
  pesoActual: number | null
}

// Sin ancho: cada uso define el suyo (w-full / flex-1 / w-16). `w-full` en la
// base pisaba a los anchos fijos de las filas por animal.
const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

/**
 * Editor de pesos reutilizable (peso inicial inline y modal de intermedio).
 * El peso SIEMPRE se guarda por animal: en modo 'total' se reparte
 * (pesoTotal / cantidad) y se previsualiza por animal (no editable); en modo
 * 'animal' se edita cada fila y el total se sumariza (no editable).
 */
export function EditorPesos({
  animales,
  fechaInicial,
  mostrarFecha = true,
  modoDefault = 'total',
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  animales: EditorAnimalRow[]
  fechaInicial?: string | null
  mostrarFecha?: boolean
  /** Modo inicial del editor ('animal' al editar un pesaje ya cargado). */
  modoDefault?: 'total' | 'animal'
  submitLabel: string
  busy?: boolean
  onSubmit: (p: CargarPesajesPayload) => Promise<void> | void
  onCancel?: () => void
}) {
  const sumaActual = useMemo(
    () => round2(animales.reduce((acc, a) => acc + (a.pesoActual ?? 0), 0)),
    [animales],
  )
  const [modo, setModo] = useState<'total' | 'animal'>(modoDefault)
  const [fecha, setFecha] = useState(fechaInicial || hoyIso())
  const [pesoTotal, setPesoTotal] = useState(sumaActual ? String(sumaActual) : '')
  const [desbasteTotal, setDesbasteTotal] = useState('')
  const [filas, setFilas] = useState<Record<number, { peso: string; desbaste: string }>>(
    () =>
      Object.fromEntries(
        animales.map((a) => [
          a.id,
          {
            peso: a.pesoActual != null ? String(a.pesoActual) : '',
            desbaste: '',
          },
        ]),
      ),
  )

  const totalNum = parseNum(pesoTotal)
  const n = animales.length
  const porAnimal = totalNum != null && n > 0 ? round2(totalNum / n) : null

  const sumaAnimal = useMemo(
    () =>
      round2(
        animales.reduce((acc, a) => acc + (parseNum(filas[a.id]?.peso ?? '') ?? 0), 0),
      ),
    [animales, filas],
  )

  const submit = async () => {
    if (modo === 'total') {
      if (totalNum == null || totalNum <= 0) return
      const desb = parseNum(desbasteTotal)
      await onSubmit({
        fecha,
        modo: 'total',
        pesoTotal: totalNum,
        ...(desb != null ? { desbasteTotal: desb } : {}),
      })
    } else {
      const rows = animales
        .map((a) => {
          const peso = parseNum(filas[a.id]?.peso ?? '')
          const desb = parseNum(filas[a.id]?.desbaste ?? '')
          return peso != null
            ? {
              animalId: a.id,
              peso,
              ...(desb != null ? { desbaste: desb } : {}),
            }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
      if (rows.length === 0) return
      await onSubmit({ fecha, modo: 'animal', animales: rows })
    }
  }

  return (
    <div className="space-y-4">
      {mostrarFecha && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Fecha del pesaje *</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
      )}

      {/* Toggle total / por animal */}
      <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
        {(['total', 'animal'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${modo === m
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {m === 'total' ? 'Peso total de lote' : 'Peso por animal'}
          </button>
        ))}
      </div>

      {modo === 'total' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Peso total (kg) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pesoTotal}
                onChange={(e) => setPesoTotal(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Ej: 12000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Desbaste total <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={desbasteTotal}
                onChange={(e) => setDesbasteTotal(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Ej: 200"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {porAnimal != null
              ? `≈ ${fmtPeso(porAnimal)} kg por animal (total ÷ ${n}).`
              : 'Ingresá el peso total para ver el reparto por animal.'}
          </p>
          {/* Preview por animal (no editable) */}
          <div className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto">
            {animales.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="text-muted-foreground truncate">
                  {a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {porAnimal != null ? `${fmtPeso(porAnimal)} kg` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-foreground tabular-nums">{fmtPeso(sumaAnimal)} kg</span>
            <span className="text-muted-foreground">total (suma de los animales)</span>
          </div>
          <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
            {animales.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-35 shrink-0 text-sm text-muted-foreground truncate" title={a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`}>
                  {a.caravana ? `Caravana: ${a.caravana}` : `#${a.nAnimal ?? a.id}`}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filas[a.id]?.peso ?? ''}
                  onChange={(e) =>
                    setFilas((s) => ({ ...s, [a.id]: { ...(s[a.id] ?? { desbaste: '' }), peso: e.target.value } }))
                  }
                  className={`${inputCls} w-35 shrink-0`}
                  placeholder="Peso (kg)"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filas[a.id]?.desbaste ?? ''}
                  onChange={(e) =>
                    setFilas((s) => ({ ...s, [a.id]: { ...(s[a.id] ?? { peso: '' }), desbaste: e.target.value } }))
                  }
                  className={`${inputCls} w-30 shrink-0`}
                  placeholder="Desb."
                  title="Desbaste (opcional)"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
