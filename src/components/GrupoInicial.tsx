import { useState } from 'react'
import { Pencil } from 'lucide-react'
import api from '../lib/api'
import { EditorPesos, type EditorAnimalRow } from './EditorPesos'
import { fmtPeso, type CargarPesajesPayload } from '../lib/pesos'

const extractMsg = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message || fallback

/**
 * Editor del PESAJE INICIAL de un grupo (todo el lote cuando hay una sola
 * partida, o una partida concreta cuando hay varias). Muestra el total (suma
 * de los pesos actuales) y un botón "Editar" que abre el EditorPesos. Al
 * guardar envía `idPartida` (si aplica) para que el server reparte/valida sólo
 * sobre los animales de ese grupo.
 */
export function GrupoInicial({
  loteId,
  titulo,
  badge,
  animales,
  idPartida,
  fechaInicial,
  puedeEscribir,
  onMutate,
}: {
  loteId: number
  titulo: string
  badge?: string
  animales: EditorAnimalRow[]
  idPartida?: number
  fechaInicial?: string | null
  puedeEscribir: boolean
  onMutate: () => Promise<void> | void
}) {
  const [editando, setEditando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = animales.reduce((acc, a) => acc + (a.pesoActual ?? 0), 0)
  const pesados = animales.filter((a) => a.pesoActual != null).length

  const submit = async (payload: CargarPesajesPayload) => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/lotes/${loteId}/pesajes/inicial`, {
        ...payload,
        ...(idPartida ? { idPartida } : {}),
      })
      await onMutate()
      setEditando(false)
    } catch (err) {
      console.error(err)
      setError(extractMsg(err, 'No se pudo guardar el peso inicial.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
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
            onClick={() => {
              setEditando((v) => !v)
              setError('')
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Pencil className="size-3.5" strokeWidth={2} />
            {editando ? 'Cancelar' : 'Editar'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {editando && puedeEscribir && (
        <div className="px-3 pb-3">
          <EditorPesos
            animales={animales}
            fechaInicial={fechaInicial}
            submitLabel="Guardar peso inicial"
            busy={busy}
            onSubmit={submit}
            onCancel={() => setEditando(false)}
          />
        </div>
      )}
    </div>
  )
}
