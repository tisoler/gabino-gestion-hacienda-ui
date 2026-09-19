import { Pencil } from 'lucide-react'
import { fmtPeso } from '../lib/pesos'
import type { EditorAnimalRow } from './EditorPesos'

/**
 * Fila de display del PESAJE INICIAL de un grupo (lote o partida): total y
 * cuántos tienen peso inicial. El "Editar" abre el modal unificado (`onEditar`).
 */
export function GrupoInicial({
  titulo,
  badge,
  animales,
  puedeEscribir,
  onEditar,
}: {
  titulo: string
  badge?: string
  animales: EditorAnimalRow[]
  puedeEscribir: boolean
  onEditar: () => void
}) {
  const total = animales.reduce((acc, a) => acc + (a.pesoActual ?? 0), 0)
  const pesados = animales.filter((a) => a.pesoActual != null).length

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {badge && (
          <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-primary bg-primary-soft">
            {badge}
          </span>
        )}
        <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 text-info bg-info-soft">
          Inicial
        </span>
        <span className="font-medium text-foreground">{titulo}</span>
        <span className="text-xs text-muted-foreground">
          Total {fmtPeso(total)} kg · {pesados} de {animales.length} animales
        </span>
      </div>
      {puedeEscribir && (
        <button
          onClick={onEditar}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
        >
          <Pencil className="size-3.5" strokeWidth={2} />
          Editar
        </button>
      )}
    </div>
  )
}