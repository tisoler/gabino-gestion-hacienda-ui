import { useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete, { type SelectAutocompleteOption } from './SelectAutocomplete'
import { InsumoModal, type InsumoFormValues } from './InsumoModal'

const inputCls =
  'px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors'

interface Fila {
  key: number
  /** id positivo = insumo existente; id negativo = nuevo local ("crear vía dieta"). */
  idInsumo: string | number
  porcentaje: string
}

interface InsumoOpcion {
  id: number
  nombre: string
  idEmpresa: number | null
  categoria?: { id: number; nombre: string } | null
}

interface CategoriaInsumo {
  id: number
  nombre: string
  idEmpresa: number | null
}

/** Categoría que habilita a un insumo a componer dietas. */
const CATEGORIA_DIETA = 'ingrediente dieta'

const parseNum = (s: string): number | null => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

/**
 * Alta de dieta (o nueva versión): nombre + insumos con proporción (%),
 * suma 100. Sólo entran insumos con categoría "Ingrediente dieta" (global o
 * de la empresa de la dieta). Si lo tipeado no existe, se abre el modal de
 * insumo (nombre prefill, categoría fija sólo-lectura, alcance de la dieta):
 * con escritura:insumo se persiste por POST /insumos; si no, queda local y
 * el server lo crea al guardar la dieta ("crear vía dieta"). Cada selector
 * excluye los ya elegidos en otras filas. El primer insumo arranca en 100%
 * y los siguientes en 100 − Σ(previos).
 */
export function DietaFormModal({
  inicial,
  empresas = [],
  puedeElegirAlcance = false,
  puedeCrearInsumo = false,
  currentEmpresaId = null,
  onClose,
  onOk,
}: {
  inicial?: {
    nombre: string
    insumos: { idInsumo: number; porcentaje: number }[]
    idEmpresa: number | null
  }
  empresas?: { id: number; nombre: string }[]
  puedeElegirAlcance?: boolean
  /** Con escritura:insumo el alta on-the-fly persiste por POST /insumos. */
  puedeCrearInsumo?: boolean
  currentEmpresaId?: number | null
  onClose: () => void
  onOk: () => Promise<void> | void
}) {
  const { mutate } = useSWRConfig()
  const esVersion = !!inicial
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [alcance, setAlcance] = useState<string | number>(
    esVersion ? (inicial!.idEmpresa ?? 'global') : 'global',
  )
  const [filas, setFilas] = useState<Fila[]>(() =>
    inicial?.insumos?.length
      ? inicial.insumos.map((i, idx) => ({
          key: idx + 1,
          idInsumo: i.idInsumo,
          porcentaje: String(i.porcentaje),
        }))
      : [{ key: 1, idInsumo: '', porcentaje: '100' }],
  )
  // Insumos nuevos sin permiso de escritura:insumo (los crea el server al
  // guardar la dieta). Con permiso se persisten directo por POST /insumos.
  const [locales, setLocales] = useState<{ tempId: number; vals: InsumoFormValues }[]>([])
  const [insumoModal, setInsumoModal] = useState<{ nombre: string; filaKey: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sigue, setSigue] = useState((inicial?.insumos?.length ?? 1) + 1)

  // Alcance efectivo de la dieta (para filtrar insumos y fijar el alta).
  const alcanceEfectivo: number | null = esVersion
    ? (inicial!.idEmpresa ?? null)
    : puedeElegirAlcance
      ? (alcance === 'global' ? null : Number(alcance))
      : (currentEmpresaId ?? null)
  const destinoGlobal = alcanceEfectivo == null

  const insumosKey =
    `/insumos?scope=${destinoGlobal ? 'global' : 'todas'}` +
    (!destinoGlobal && alcanceEfectivo != null ? `&idEmpresa=${alcanceEfectivo}` : '')
  const { data: insumos } = useSWR<InsumoOpcion[]>(insumosKey, fetcher, {
    revalidateOnFocus: false,
  })
  const { data: categorias } = useSWR<CategoriaInsumo[]>('/insumos/categorias', fetcher, {
    revalidateOnFocus: false,
  })

  // Insumos aptos para dieta (categoría "Ingrediente dieta") + nuevos locales.
  const opcionesBase = useMemo<SelectAutocompleteOption[]>(() => {
    const ex = (insumos ?? [])
      .filter((i) => i.categoria?.nombre.toLowerCase() === CATEGORIA_DIETA)
      .map((i) => ({ value: i.id, label: i.nombre }))
    const nu = locales.map((n) => ({ value: n.tempId, label: n.vals.nombre }))
    return [...ex, ...nu]
  }, [insumos, locales])

  // Categoría fija del alta (por nombre; prefiere la de la empresa).
  const categoriaFija = useMemo(() => {
    const cands = (categorias ?? []).filter((c) => c.nombre.toLowerCase() === CATEGORIA_DIETA)
    if (cands.length === 0) return undefined
    if (alcanceEfectivo != null) {
      return cands.find((c) => c.idEmpresa === alcanceEfectivo)
        ?? cands.find((c) => c.idEmpresa == null)
        ?? cands[0]
    }
    return cands.find((c) => c.idEmpresa == null) ?? cands[0]
  }, [categorias, alcanceEfectivo])

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
    // Siguiente insumo: 100 − Σ(los demás actuales), mínimo 0.
    setFilas((fs) => {
      const sumaOtros = fs.reduce((acc, f) => acc + (parseNum(f.porcentaje) ?? 0), 0)
      const val = Math.max(0, Math.round((100 - sumaOtros) * 100) / 100)
      return [...fs, { key, idInsumo: '', porcentaje: val > 0 ? String(val) : '' }]
    })
  }

  const quitarFila = (key: number) =>
    setFilas((fs) => (fs.length > 1 ? fs.filter((f) => f.key !== key) : fs))

  // Crear on-the-fly: si lo tipeado ya existe (empresa o global) se
  // selecciona; si no, se abre el modal de insumo con el nombre prefill.
  const crearInsumoOnTheFly = async (txt: string, filaKey: number): Promise<string | number> => {
    const limpio = txt.trim().replace(/\s+/g, ' ')
    const existente = opcionesBase.find(
      (o) => o.label.toLowerCase() === limpio.toLowerCase(),
    )
    if (existente) return existente.value
    setInsumoModal({ nombre: limpio, filaKey })
    // Se retorna el valor actual: el modal lo actualiza al guardar.
    const fila = filas.find((f) => f.key === filaKey)
    return fila?.idInsumo ?? ''
  }

  const guardarInsumoModal = async (vals: InsumoFormValues) => {
    if (!insumoModal) return
    if (puedeCrearInsumo) {
      const { data: creado } = await api.post<InsumoOpcion>('/insumos', vals)
      await mutate(insumosKey)
      setFila(insumoModal.filaKey, { idInsumo: creado.id })
    } else {
      const tempId = -Date.now()
      setLocales((prev) => [...prev, { tempId, vals }])
      setFila(insumoModal.filaKey, { idInsumo: tempId })
    }
    setInsumoModal(null)
  }

  const submit = async () => {
    setError('')
    if (!nombre.trim()) return setError('Dale un nombre a la dieta (ej: TMR).')
    if (filas.some((f) => f.idInsumo === '')) return setError('Falta elegir un insumo.')
    if (filas.some((f) => parseNum(f.porcentaje) == null)) return setError('Completá los porcentajes.')
    if (!sumaOk) return setError(`Las proporciones deben sumar 100% (suman ${Math.round(suma * 100) / 100}%).`)
    const claves = filas.map((f) => String(f.idInsumo).toLowerCase())
    if (new Set(claves).size !== claves.length) return setError('No repitas el mismo insumo.')

    const insumosPayload = filas.map((f) => {
      const v = Number(f.idInsumo)
      const porcentaje = parseNum(f.porcentaje)
      if (v < 0) {
        const loc = locales.find((l) => l.tempId === v)
        if (!loc) return { nombre: '', porcentaje }
        return {
          nombre: loc.vals.nombre,
          ...(loc.vals.descripcion ? { descripcion: loc.vals.descripcion } : {}),
          ...(loc.vals.precioReferencia != null ? { precioReferencia: loc.vals.precioReferencia } : {}),
          ...(loc.vals.unidad ? { unidad: loc.vals.unidad } : {}),
          porcentaje,
        }
      }
      return { idInsumo: v, porcentaje }
    })
    if (insumosPayload.some((i) => 'nombre' in i && !i.nombre)) return setError('Insumo nuevo sin nombre.')

    setBusy(true)
    try {
      await api.post('/dietas', {
        nombre: nombre.trim(),
        insumos: insumosPayload,
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
              Los insumos nuevos se crearán con este alcance.
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
            <span className="text-xs font-medium text-foreground">Insumos *</span>
            <span
              className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                sumaOk ? 'text-success bg-success-soft' : 'text-warning bg-warning-soft'
              }`}
            >
              {Math.round(suma * 100) / 100}% {sumaOk ? '· completo' : `· faltan ${Math.round(restante * 100) / 100}%`}
            </span>
          </div>
          {filas.map((f) => {
            // Excluir de ESTA fila los insumos elegidos en las otras.
            const usadosOtras = new Set(
              filas.filter((o) => o.key !== f.key && o.idInsumo !== '').map((o) => Number(o.idInsumo)),
            )
            const opts = opcionesBase.filter((o) => !usadosOtras.has(Number(o.value)))
            return (
              <div key={f.key} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SelectAutocomplete
                    placeholder={destinoGlobal ? 'Insumo global (ej: maíz)...' : 'Insumo (ej: maíz)...'}
                    value={f.idInsumo}
                    onChange={(v) => setFila(f.key, { idInsumo: v })}
                    options={opts}
                    clearable={false}
                    allowCreate
                    onCreate={(txt) => crearInsumoOnTheFly(txt, f.key)}
                    renderTag={(o) => {
                      const val = Number(o.value)
                      if (val < 0) {
                        return (
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                            Nuevo
                          </span>
                        )
                      }
                      const item = (insumos ?? []).find((c) => c.id === val)
                      return item && item.idEmpresa == null ? (
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
                  title="Quitar insumo"
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
            <Plus className="size-3.5" strokeWidth={2} /> Agregar insumo
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

      {insumoModal && (
        <InsumoModal
          nombreInicial={insumoModal.nombre}
          categoriaFija={categoriaFija ? { id: categoriaFija.id, nombre: categoriaFija.nombre } : undefined}
          alcanceFijo={
            destinoGlobal
              ? { tipo: 'global' }
              : (alcanceEfectivo != null ? { tipo: 'empresa', idEmpresa: alcanceEfectivo } : { tipo: 'empresa' })
          }
          categorias={categorias ?? []}
          empresas={empresas}
          puedeElegirAlcance={false}
          onClose={() => setInsumoModal(null)}
          onOk={guardarInsumoModal}
        />
      )}
    </div>
  )
}
