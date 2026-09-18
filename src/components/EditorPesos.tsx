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
  salidos,
  fechaInicial,
  mostrarFecha = true,
  modoDefault = 'total',
  modoMixto = false,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  animales: EditorAnimalRow[]
  /** Animales ya salidos: se listan al final, sólo lectura (peso de la salida). */
  salidos?: EditorAnimalRow[]
  fechaInicial?: string | null
  mostrarFecha?: boolean
  /** Modo inicial del editor ('animal' al editar un pesaje ya cargado). */
  modoDefault?: 'total' | 'animal'
  /**
   * Vista mixta: total (peso + desbaste) y filas por animal a la vez. Cambiar
   * el total reparte ÷ N; editar un animal recalcula el total.
   */
  modoMixto?: boolean
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
  // Con animales ya salidos se fuerza el modo por animal: los salidos se
  // listan con su peso registrado y no se reparte el total entre ellos.
  const conSalidos = (salidos?.length ?? 0) > 0
  const modoEfectivo = conSalidos ? 'animal' : modo
  const [error, setError] = useState('')
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

  // --- Vista mixta: sincronización total ↔ individual ---
  const distribuir = (campo: 'peso' | 'desbaste', total: number) => {
    if (n === 0) return
    const per = round2(total / n)
    setFilas((s) =>
      Object.fromEntries(
        animales.map((a) => [
          a.id,
          {
            peso: campo === 'peso' ? String(per) : (s[a.id]?.peso ?? ''),
            desbaste: campo === 'desbaste' ? String(per) : (s[a.id]?.desbaste ?? ''),
          },
        ]),
      ),
    )
  }
  const onTotalPeso = (v: string) => {
    setPesoTotal(v)
    const num = parseNum(v)
    if (num != null) distribuir('peso', num)
  }
  const onTotalDesbaste = (v: string) => {
    setDesbasteTotal(v)
    const num = parseNum(v)
    if (num != null) distribuir('desbaste', num)
  }
  const onFilaPeso = (id: number, v: string) => {
    setFilas((s) => ({ ...s, [id]: { ...(s[id] ?? { desbaste: '' }), peso: v } }))
    let suma = 0
    for (const a of animales) suma += parseNum(a.id === id ? v : (filas[a.id]?.peso ?? '')) ?? 0
    setPesoTotal(round2(suma) ? String(round2(suma)) : '')
  }
  const onFilaDesbaste = (id: number, v: string) => {
    setFilas((s) => ({ ...s, [id]: { ...(s[id] ?? { peso: '' }), desbaste: v } }))
    let suma = 0
    for (const a of animales) suma += parseNum(a.id === id ? v : (filas[a.id]?.desbaste ?? '')) ?? 0
    setDesbasteTotal(round2(suma) ? String(round2(suma)) : '')
  }

  const submit = async () => {
    setError('')
    if (!modoMixto && modoEfectivo === 'total') {
      if (totalNum == null || totalNum <= 0) return
      const desb = parseNum(desbasteTotal)
      await onSubmit({
        fecha,
        modo: 'total',
        pesoTotal: totalNum,
        ...(desb != null ? { desbasteTotal: desb } : {}),
      })
    } else {
      const rows = animales.map((a) => {
        const peso = parseNum(filas[a.id]?.peso ?? '')
        const desb = parseNum(filas[a.id]?.desbaste ?? '')
        return {
          animalId: a.id,
          peso,
          desbaste: desb,
        }
      })
      // Por animal exige el peso de TODOS los animales del grupo.
      if (rows.some((r) => r.peso == null)) {
        setError('Ingresá el peso de todos los animales.')
        return
      }
      await onSubmit({
        fecha,
        modo: 'animal',
        animales: rows.map((r) => ({
          animalId: r.animalId,
          peso: r.peso as number,
          ...(r.desbaste != null ? { desbaste: r.desbaste } : {}),
        })),
      })
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

      {/* Toggle total / por animal (oculto en la vista mixta) */}
      {!modoMixto &&
        (conSalidos ? (
          <p className="text-xs text-muted-foreground">
            Peso por animal (hay animales ya salidos con su peso registrado).
          </p>
        ) : (
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
        ))}

      {modoMixto ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Peso total (kg)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pesoTotal}
                onChange={(e) => onTotalPeso(e.target.value)}
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
                onChange={(e) => onTotalDesbaste(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder="Ej: 200"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El total se reparte ÷ {n} al cambiarlo; si editás un animal, se recalcula el total.
          </p>
          <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
            {animales.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                <span
                  className="w-35 shrink-0 text-sm text-muted-foreground truncate"
                  title={a.caravana ? `Caravana ${a.caravana}` : `Animal ${a.nAnimal ?? a.id}`}
                >
                  {a.caravana ? `Caravana: ${a.caravana}` : `#${a.nAnimal ?? a.id}`}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filas[a.id]?.peso ?? ''}
                  onChange={(e) => onFilaPeso(a.id, e.target.value)}
                  className={`${inputCls} w-35 shrink-0`}
                  placeholder="Peso (kg)"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={filas[a.id]?.desbaste ?? ''}
                  onChange={(e) => onFilaDesbaste(a.id, e.target.value)}
                  className={`${inputCls} w-30 shrink-0`}
                  placeholder="Desb."
                  title="Desbaste (opcional)"
                />
              </div>
            ))}
          </div>
        </div>
      ) : modoEfectivo === 'total' ? (
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
              <div key={a.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
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

      {conSalidos && (
        <div className="border border-primary/30 rounded-md divide-y divide-border">
          <div className="px-3 py-1.5 bg-primary-soft/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ya salieron ({salidos!.length}) — peso registrado en la salida
            </p>
          </div>
          {salidos!.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm opacity-80">
              <span className="text-foreground truncate">
                {a.caravana ? `Caravana: ${a.caravana}` : `#${a.nAnimal ?? a.id}`}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {fmtPeso(a.pesoActual)} kg
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
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
