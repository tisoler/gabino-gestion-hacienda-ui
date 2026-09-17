import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete, { type SelectAutocompleteOption } from './SelectAutocomplete'
import type { CatalogoItem } from './CatalogoSelect'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface Fila {
  key: number
  /** id positivo = existente; id negativo = nuevo creado en el FE. */
  idIngrediente: string | number
  porcentaje: string
}

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

/**
 * Alta de dieta (o nueva versión): nombre + ingredientes con proporción (%),
 * suma 100. Los ingredientes nuevos NO se persisten al tipearlos: se crean en
 * el FE (id temporal negativo) y el server los guarda al salvar la dieta, con el
 * alcance final elegido (global o empresa). Cada selector excluye los ya
 * elegidos en otras filas (una dieta no repite un ingrediente). El primer
 * ingrediente arranca en 100% y los siguientes en 100 − Σ(previos).
 */
export function DietaFormModal({
  inicial,
  empresas = [],
  puedeElegirAlcance = false,
  onClose,
  onOk,
}: {
  inicial?: {
    nombre: string
    ingredientes: { idIngrediente: number; porcentaje: number }[]
    idEmpresa: number | null
  }
  empresas?: { id: number; nombre: string }[]
  puedeElegirAlcance?: boolean
  onClose: () => void
  onOk: () => Promise<void> | void
}) {
  const esVersion = !!inicial
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [alcance, setAlcance] = useState<string | number>(
    esVersion ? (inicial!.idEmpresa ?? 'global') : 'global',
  )
  const [filas, setFilas] = useState<Fila[]>(() =>
    inicial?.ingredientes?.length
      ? inicial.ingredientes.map((i, idx) => ({
          key: idx + 1,
          idIngrediente: i.idIngrediente,
          porcentaje: String(i.porcentaje),
        }))
      : [{ key: 1, idIngrediente: '', porcentaje: '100' }],
  )
  const [nuevos, setNuevos] = useState<{ tempId: number; nombre: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sigue, setSigue] = useState((inicial?.ingredientes?.length ?? 1) + 1)

  // Sólo el sys-admin que elige "Global" restringe a ingredientes globales.
  // Un usuario de empresa (o el admin eligiendo una empresa) ve TODOS los
  // disponibles (globales + de su empresa) de arranque.
  const destinoGlobal = puedeElegirAlcance && alcance === 'global'

  const { data: existentes } = useSWR<CatalogoItem[]>('/catalogos/ingrediente', fetcher, {
    revalidateOnFocus: false,
  })

  // Opciones base: existentes (filtradas por alcance) + nuevos del FE.
  const opcionesBase = useMemo<SelectAutocompleteOption[]>(() => {
    const ex = (existentes ?? [])
      .filter((i) => (destinoGlobal ? i.global : true))
      .map((i) => ({ value: i.id, label: i.nombre }))
    const nu = nuevos.map((n) => ({ value: n.tempId, label: n.nombre }))
    return [...ex, ...nu]
  }, [existentes, nuevos, destinoGlobal])

  const nombreDeNuevo = (tempId: number) => nuevos.find((n) => n.tempId === tempId)?.nombre

  const suma = useMemo(
    () => filas.reduce((acc, f) => acc + (parseNum(f.porcentaje) ?? 0), 0),
    [filas],
  )
  const restante = Math.round((100 - suma) * 100) / 100
  const sumaOk = Math.abs(suma - 100) <= 0.01

  const setFila = (key: number, patch: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  const agregarFila = () => {
    const key = sigue
    setSigue((s) => s + 1)
    // Siguiente ingrediente: 100 − Σ(los demás actuales), mínimo 0.
    setFilas((fs) => {
      const sumaOtros = fs.reduce((acc, f) => acc + (parseNum(f.porcentaje) ?? 0), 0)
      const val = Math.max(0, Math.round((100 - sumaOtros) * 100) / 100)
      return [...fs, { key, idIngrediente: '', porcentaje: val > 0 ? String(val) : '' }]
    })
  }

  const quitarFila = (key: number) =>
    setFilas((fs) => (fs.length > 1 ? fs.filter((f) => f.key !== key) : fs))

  // Creación local (no persiste): devuelve un id temporal negativo y lo selecciona.
  const crearIngredienteLocal = async (txt: string): Promise<number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = opcionesBase.find(
      (o) => o.label.toLowerCase() === limpio.toLowerCase(),
    )
    if (existente) return Number(existente.value)
    const tempId = -Date.now()
    setNuevos((prev) => [...prev, { tempId, nombre: limpio }])
    return tempId
  }

  const submit = async () => {
    setError('')
    if (!nombre.trim()) return setError('Dale un nombre a la dieta (ej: TMR).')
    if (filas.some((f) => f.idIngrediente === '')) return setError('Falta elegir un ingrediente.')
    if (filas.some((f) => parseNum(f.porcentaje) == null)) return setError('Completá los porcentajes.')
    if (!sumaOk) return setError(`Las proporciones deben sumar 100% (suman ${Math.round(suma * 100) / 100}%).`)
    const claves = filas.map((f) => String(f.idIngrediente).toLowerCase())
    if (new Set(claves).size !== claves.length) return setError('No repitas el mismo ingrediente.')

    const ingredientes = filas.map((f) => {
      const v = Number(f.idIngrediente)
      const porcentaje = parseNum(f.porcentaje)
      if (v < 0) return { nombre: nombreDeNuevo(v) ?? '', porcentaje }
      return { idIngrediente: v, porcentaje }
    })
    if (ingredientes.some((i) => 'nombre' in i && !i.nombre)) return setError('Ingrediente nuevo sin nombre.')

    setBusy(true)
    try {
      await api.post('/dietas', {
        nombre: nombre.trim(),
        ingredientes,
        ...(puedeElegirAlcance ? { idEmpresa: alcance === 'global' ? null : Number(alcance) } : {}),
      })
      await onOk()
      onClose()
    } catch (err) {
      console.error(err)
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar la dieta.',
      )
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {inicial ? 'Nueva versión de la dieta' : 'Nueva dieta'}
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
          Si ya existe una dieta con este nombre se creará una <strong>nueva versión</strong> y
          la anterior queda como histórico. Las proporciones deben sumar 100%.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Nombre *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="Ej: TMR, Vacas en producción..."
          />
        </div>

        {puedeElegirAlcance && !esVersion && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Alcance</label>
            <select
              value={alcance}
              onChange={(e) => setAlcance(e.target.value === 'global' ? 'global' : Number(e.target.value))}
              className={`${inputCls} w-full cursor-pointer`}
            >
              <option value="global">Global (todas las empresas)</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Los ingredientes nuevos se crearán con este alcance.
            </p>
          </div>
        )}
        {esVersion && puedeElegirAlcance && (
          <p className="text-xs text-muted-foreground">
            Nueva versión de una dieta {inicial?.idEmpresa == null ? 'global' : 'de una empresa'}: mantiene el mismo alcance.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Ingredientes *</span>
            <span
              className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                sumaOk ? 'text-success bg-success-soft' : 'text-warning bg-warning-soft'
              }`}
            >
              {Math.round(suma * 100) / 100}% {sumaOk ? '· completo' : `· faltan ${Math.round(restante * 100) / 100}%`}
            </span>
          </div>
          {filas.map((f) => {
            // Excluir de ESTA fila los ingredientes elegidos en las otras.
            const usadosOtras = new Set(
              filas.filter((o) => o.key !== f.key && o.idIngrediente !== '').map((o) => Number(o.idIngrediente)),
            )
            const opts = opcionesBase.filter((o) => !usadosOtras.has(Number(o.value)))
            return (
              <div key={f.key} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SelectAutocomplete
                    placeholder={destinoGlobal ? 'Ingrediente global (ej: maíz)...' : 'Ingrediente (ej: maíz)...'}
                    value={f.idIngrediente}
                    onChange={(v) => setFila(f.key, { idIngrediente: v })}
                    options={opts}
                    clearable={false}
                    allowCreate
                    onCreate={crearIngredienteLocal}
                    renderTag={(o) => {
                      const val = Number(o.value)
                      if (val < 0) {
                        return (
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                            Nuevo
                          </span>
                        )
                      }
                      const item = existentes?.find((c) => c.id === val)
                      return item?.global ? (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                          Global
                        </span>
                      ) : null
                    }}
                    emptyMessage="No encontrado. Escribí para agregar."
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step="0.01"
                    value={f.porcentaje}
                    onChange={(e) => setFila(f.key, { porcentaje: e.target.value })}
                    className={`${inputCls} w-24`}
                    placeholder="%"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <button
                  onClick={() => quitarFila(f.key)}
                  disabled={filas.length === 1}
                  title="Quitar ingrediente"
                  className="p-2 rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </button>
              </div>
            )
          })}
          <button
            onClick={agregarFila}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={2} /> Agregar ingrediente
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !sumaOk || !nombre.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar dieta
          </button>
        </div>
      </div>
    </div>
  )
}
