import { X } from 'lucide-react'
import { EditorPesos, type EditorAnimalRow } from './EditorPesos'
import type { CargarPesajesPayload } from '../lib/pesos'

/**
 * Modal para agregar un pesaje intermedio al lote: sólo carga pesos (elige
 * total o por animal), no otros campos.
 */
export function PesajeIntermedioModal({
  animales,
  busy,
  onClose,
  onOk,
}: {
  animales: EditorAnimalRow[]
  busy?: boolean
  onClose: () => void
  onOk: (p: CargarPesajesPayload) => Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Agregar pesaje intermedio
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Registra un peso para una fecha nueva. En el lote aparecerá como una
          columna «Peso a X días» respecto del pesaje inicial.
        </p>
        <EditorPesos
          animales={animales}
          submitLabel="Agregar pesaje"
          busy={busy}
          onSubmit={onOk}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
