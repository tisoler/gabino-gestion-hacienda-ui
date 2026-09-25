/**
 * Atajos de hora preseteada (toggle) para los eventos con instante fecha+hora
 * (movimientos de enfermería/estado, alimentación, salidas): sólo cargan el
 * control de hora, que después se puede ajustar a mano.
 */
const ATAJOS = [
  { etiqueta: '8 AM', valor: '08:00' },
  { etiqueta: '9 AM', valor: '09:00' },
  { etiqueta: '3 PM', valor: '15:00' },
  { etiqueta: '5 PM', valor: '17:00' },
  { etiqueta: '8 PM', valor: '20:00' },
] as const

export function AtajosHora({
  value,
  onChange,
  disabled,
}: {
  /** 'HH:MM' actual (para marcar el activo). */
  value: string
  onChange: (hhmm: string) => void
  disabled?: boolean
}) {
  const actual = (value ?? '').slice(0, 5)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ATAJOS.map((a) => {
        const activo = actual === a.valor
        return (
          <button
            key={a.valor}
            type="button"
            disabled={disabled}
            onClick={() => onChange(a.valor)}
            aria-pressed={activo}
            title={`Fijar hora ${a.etiqueta}`}
            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${activo
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
          >
            {a.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
