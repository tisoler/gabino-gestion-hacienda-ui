import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import useSWR, { useSWRConfig } from 'swr'
import api, { fetcher } from '../lib/api'
import { useAuth } from '../contexts/auth-context'
import { TratamientoModal, type TratamientoFormValues } from './TratamientoModal'
import { InsumoModal, type InsumoFormValues } from './InsumoModal'
import { DietaFormModal } from './DietaFormModal'
import { matchCatalogo, type TipoCatalogo } from '../lib/planilla-import'
import type { DietaOpcion } from '../lib/alimentacion'
import type { TratamientoView } from '../lib/veterinaria'

export type { TipoCatalogo }

export interface SeleccionCatalogo {
  tipo: TipoCatalogo
  /** id existente (>0) o temporal (<0, creado sin permiso de escritura). */
  id: number
  nombre: string
  nuevo: boolean
  /** Valores para el alta posterior (sólo temporales). */
  temp?: TratamientoFormValues | InsumoFormValues
}

interface InsumoOpcion {
  id: number
  nombre: string
  idCategoria: number | null
  categoria?: { id: number; nombre: string } | null
  activo: boolean
}

/** Categoría que habilita a un insumo para tratamientos. */
const CATEGORIA_VETERINARIA_FIJA = { id: 2, nombre: 'Veterinaria' }

const TIPO_LABEL: Record<TipoCatalogo, string> = {
  dieta: 'Dieta',
  tratamiento: 'Tratamiento',
  insumo: 'Insumo',
}

const TIPO_GRUPO: Record<TipoCatalogo, string> = {
  dieta: 'Dietas',
  tratamiento: 'Tratamientos',
  insumo: 'Insumos veterinarios',
}

interface OpcionCatalogo {
  key: string
  tipo: TipoCatalogo
  id: number
  label: string
  nuevo: boolean
}

/**
 * Selector unificado de dieta / tratamiento / insumo veterinario (para las
 * planillas importadas, donde una fila puede traer cualquiera de los tres).
 * - Agrupa las opciones por tipo con encabezado propio.
 * - Permite filtrar por uno o más tipos (chips).
 * - Si lo tipeado no existe, permite crearlo eligiendo el tipo (default:
 *   dieta) y abre el modal correspondiente. Sin permiso de escritura el
 *   tratamiento/insumo queda temporal (se persiste al guardar); la dieta
 *   siempre se persiste al crearla.
 */
export function CatalogoUnificadoSelect({
  value,
  textoInicial,
  onChange,
  placeholder = 'Buscar…',
  clearable = false,
  disabled = false,
}: {
  value: SeleccionCatalogo | null
  /** Texto para autocompletar al montar (p. ej. OCR de la fila). */
  textoInicial?: string
  onChange: (v: SeleccionCatalogo | null) => void
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
}) {
  const { permisos, isSysAdmin, currentEmpresaId } = useAuth()
  const { mutate } = useSWRConfig()
  const puedeEscribirDieta = permisos.includes('escritura:dieta')
  const puedeEscribirVet = permisos.includes('escritura:veterinaria')
  const puedeEscribirInsumo = permisos.includes('escritura:insumo')

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tipos, setTipos] = useState<Record<TipoCatalogo, boolean>>({
    dieta: true,
    tratamiento: true,
    insumo: true,
  })
  const tiposCreables = useMemo<TipoCatalogo[]>(
    () => (puedeEscribirDieta ? ['dieta', 'tratamiento', 'insumo'] : ['tratamiento', 'insumo']),
    [puedeEscribirDieta],
  )
  const [tipoCrear, setTipoCrear] = useState<TipoCatalogo>(() =>
    puedeEscribirDieta ? 'dieta' : 'tratamiento',
  )
  const [creando, setCreando] = useState<{ tipo: TipoCatalogo; nombre: string } | null>(null)
  const [nuevosTrat, setNuevosTrat] = useState<{ tempId: number; vals: TratamientoFormValues }[]>([])
  const [nuevosIns, setNuevosIns] = useState<{ tempId: number; vals: InsumoFormValues }[]>([])
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const tempSeq = useRef(-1)
  const interactuo = useRef(false)

  const { data: dietas } = useSWR<DietaOpcion[]>('/dietas', fetcher, { revalidateOnFocus: false })
  const { data: tratamientos } = useSWR<TratamientoView[]>('/tratamientos', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: insumos } = useSWR<InsumoOpcion[]>('/insumos?scope=todas', fetcher, {
    revalidateOnFocus: false,
  })
  const { data: empresas } = useSWR<{ id: number; nombre: string }[]>(
    isSysAdmin ? '/empresas' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const insumosVet = useMemo(
    () =>
      (insumos ?? []).filter(
        (i) => i.activo !== false && (i.categoria?.nombre ?? '').toLowerCase() === 'veterinaria',
      ),
    [insumos],
  )

  // Autocompletar desde el texto inicial cuando llegan los catálogos.
  useEffect(() => {
    if (interactuo.current || value || !textoInicial?.trim()) return
    if (!dietas && !tratamientos && !insumosVet) return
    const m = matchCatalogo(textoInicial, {
      dietas: dietas ?? [],
      tratamientos: tratamientos ?? [],
      insumos: insumosVet,
    })
    if (!m) return
    const nombre =
      m.tipo === 'dieta'
        ? (dietas ?? []).find((d) => d.id === m.id)?.nombre
        : m.tipo === 'tratamiento'
          ? (tratamientos ?? []).find((t) => t.id === m.id)?.nombre
          : insumosVet.find((i) => i.id === m.id)?.nombre
    if (nombre) onChange({ tipo: m.tipo, id: m.id, nombre, nuevo: false })
  }, [dietas, tratamientos, insumosVet, textoInicial, value, onChange])

  const opciones: OpcionCatalogo[] = useMemo(() => {
    const lista: OpcionCatalogo[] = []
    for (const d of dietas ?? []) {
      lista.push({ key: `dieta:${d.id}`, tipo: 'dieta', id: d.id, label: `${d.nombre} (v${d.version})`, nuevo: false })
    }
    for (const t of tratamientos ?? []) {
      if (t.activo === false) continue
      lista.push({ key: `tratamiento:${t.id}`, tipo: 'tratamiento', id: t.id, label: t.nombre, nuevo: false })
    }
    for (const i of insumosVet) {
      lista.push({ key: `insumo:${i.id}`, tipo: 'insumo', id: i.id, label: i.nombre, nuevo: false })
    }
    for (const n of nuevosTrat) {
      lista.push({ key: `tratamiento:${n.tempId}`, tipo: 'tratamiento', id: n.tempId, label: n.vals.nombre, nuevo: true })
    }
    for (const n of nuevosIns) {
      lista.push({ key: `insumo:${n.tempId}`, tipo: 'insumo', id: n.tempId, label: n.vals.nombre, nuevo: true })
    }
    return lista
      .filter((o) => tipos[o.tipo])
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
  }, [dietas, tratamientos, insumosVet, nuevosTrat, nuevosIns, tipos])

  const q = search.trim().toLowerCase()
  const filtradas = useMemo(
    () => (q ? opciones.filter((o) => o.label.toLowerCase().includes(q)) : opciones),
    [opciones, q],
  )
  const grupos = useMemo(() => {
    const orden: TipoCatalogo[] = ['dieta', 'tratamiento', 'insumo']
    return orden
      .filter((t) => tipos[t])
      .map((t) => ({ tipo: t, items: filtradas.filter((o) => o.tipo === t) }))
      .filter((g) => g.items.length > 0)
  }, [filtradas, tipos])

  const busqueda = search.trim()
  const existeExacto = useMemo(() => {
    if (!busqueda) return true
    const s = busqueda.toLowerCase()
    return (
      (dietas ?? []).some((d) => d.nombre.trim().toLowerCase() === s) ||
      (tratamientos ?? []).some((t) => t.nombre.trim().toLowerCase() === s) ||
      insumosVet.some((i) => i.nombre.trim().toLowerCase() === s) ||
      nuevosTrat.some((n) => n.vals.nombre.trim().toLowerCase() === s) ||
      nuevosIns.some((n) => n.vals.nombre.trim().toLowerCase() === s)
    )
  }, [busqueda, dietas, tratamientos, insumosVet, nuevosTrat, nuevosIns])
  const mostrarCrear = !!busqueda && !existeExacto && !disabled

  // Cierra al hacer click afuera (incluye el dropdown en portal).
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Reposiciona el dropdown ante scroll/resize.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const el = triggerRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left, width: r.width })
      }
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const elegir = (v: SeleccionCatalogo | null) => {
    interactuo.current = true
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  const toggleTipo = (t: TipoCatalogo) => setTipos((s) => ({ ...s, [t]: !s[t] }))

  const handleCrear = () => {
    if (!busqueda) return
    // Cerrar el dropdown: el modal de alta se abre encima con su propio blur
    // y el portal quedaría flotando por encima.
    setOpen(false)
    setCreando({ tipo: tipoCrear, nombre: busqueda })
  }

  const onDietaGuardada = async () => {
    const nombre = creando?.nombre ?? ''
    setCreando(null)
    const fresh = await mutate<DietaOpcion[]>('/dietas')
    const lista = Array.isArray(fresh) ? fresh : (dietas ?? [])
    const found = lista.find((d) => d.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())
    if (found) elegir({ tipo: 'dieta', id: found.id, nombre: found.nombre, nuevo: false })
  }

  const guardarTratamiento = async (vals: TratamientoFormValues) => {
    if (!creando || creando.tipo !== 'tratamiento') return
    if (puedeEscribirVet) {
      const { data } = await api.post('/tratamientos', vals)
      await mutate('/tratamientos')
      setCreando(null)
      elegir({ tipo: 'tratamiento', id: data.id, nombre: data.nombre ?? vals.nombre, nuevo: false })
    } else {
      const tempId = tempSeq.current--
      setNuevosTrat((prev) => [...prev, { tempId, vals }])
      setCreando(null)
      elegir({ tipo: 'tratamiento', id: tempId, nombre: vals.nombre, nuevo: true, temp: vals })
    }
  }

  const guardarInsumo = async (vals: InsumoFormValues) => {
    if (!creando || creando.tipo !== 'insumo') return
    if (puedeEscribirInsumo) {
      const { data } = await api.post('/insumos', vals)
      await mutate('/insumos?scope=todas')
      setCreando(null)
      elegir({ tipo: 'insumo', id: data.id, nombre: data.nombre ?? vals.nombre, nuevo: false })
    } else {
      const tempId = tempSeq.current--
      setNuevosIns((prev) => [...prev, { tempId, vals }])
      setCreando(null)
      elegir({ tipo: 'insumo', id: tempId, nombre: vals.nombre, nuevo: true, temp: vals })
    }
  }

  const TIPO_OPCIONES: { value: TipoCatalogo; label: string }[] = [
    { value: 'dieta', label: 'Dieta' },
    { value: 'tratamiento', label: 'Tratamiento' },
    { value: 'insumo', label: 'Insumo' },
  ]

  const dropWidth = pos
    ? Math.min(Math.max(pos.width, 520), (typeof window !== 'undefined' ? window.innerWidth : 1024) - 24)
    : 520
  const dropLeft = pos
    ? Math.max(12, Math.min(pos.left, (typeof window !== 'undefined' ? window.innerWidth : 1024) - dropWidth - 12))
    : 0
  const dropdown =
    open && !disabled && pos && !creando
      ? createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: pos.top, left: dropLeft, width: dropWidth, maxWidth: 'calc(100vw - 24px)', zIndex: 60 }}
          className="bg-card border border-border rounded-md shadow-lg overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
            <Search className="size-3.5 text-muted-foreground shrink-0" strokeWidth={2} />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && mostrarCrear) {
                  e.preventDefault()
                  void handleCrear()
                }
              }}
              placeholder="Buscar…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          {!mostrarCrear && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border bg-muted/40">
              {(Object.keys(TIPO_LABEL) as TipoCatalogo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTipo(t)}
                  title={`Mostrar/ocultar ${TIPO_GRUPO[t].toLowerCase()}`}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${tipos[t]
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {grupos.length === 0 && !mostrarCrear && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>
            )}
            {grupos.length === 0 && mostrarCrear && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin coincidencias en dietas, tratamientos o insumos.</p>
            )}
            {grupos.map((g) => (
              <div key={g.tipo}>
                <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {TIPO_GRUPO[g.tipo]}
                </p>
                {g.items.map((o) => {
                  const isSelected =
                    value != null && value.tipo === o.tipo && value.id === o.id
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => elegir({ tipo: o.tipo, id: o.id, nombre: o.label, nuevo: o.nuevo })}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-accent'
                        }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{o.label}</span>
                        {o.nuevo && (
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-info bg-info-soft rounded-full px-1.5 py-0.5">
                            Nuevo
                          </span>
                        )}
                      </span>
                      {isSelected && <Check className="size-4 shrink-0" strokeWidth={2} />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {mostrarCrear && (
            <div className="border-t border-border p-2.5 space-y-2 bg-muted/20">
              <p className="px-0.5 text-[11px] text-muted-foreground">
                No existe "{busqueda}" en el catálogo. Elegí el tipo y crealo:
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Crear como:</span>
                {TIPO_OPCIONES.filter((t) => tiposCreables.includes(t.value)).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipoCrear(t.value)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer border ${tipoCrear === t.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCrear}
                className="w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-sm font-medium text-primary bg-primary-soft hover:opacity-90 transition-opacity cursor-pointer text-left"
              >
                <Plus className="size-4 shrink-0 mt-0.5" strokeWidth={2} />
                <span className="break-words min-w-0">
                  Agregar "{busqueda}" como {TIPO_LABEL[tipoCrear].toLowerCase()}
                </span>
              </button>
            </div>
          )}
        </div>,
        document.body,
      )
      : null

  return (
    <div ref={rootRef} className="w-full">
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggle()
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-background border border-border rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <span className={`truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value ? value.nombre : placeholder}
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          {value && (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
              {value.nuevo ? 'Nuevo' : TIPO_LABEL[value.tipo]}
            </span>
          )}
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                elegir(null)
              }}
              aria-label="Limpiar selección"
              className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
            >
              <X className="size-3.5" strokeWidth={2} />
            </span>
          )}
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </span>
      </div>
      {dropdown}

      {creando?.tipo === 'dieta' && (
        <DietaFormModal
          inicial={{ nombre: creando.nombre, insumos: [], idEmpresa: null }}
          empresas={empresas ?? []}
          puedeElegirAlcance={isSysAdmin}
          puedeCrearInsumo={permisos.includes('escritura:insumo')}
          currentEmpresaId={currentEmpresaId}
          onClose={() => setCreando(null)}
          onOk={onDietaGuardada}
        />
      )}

      {creando?.tipo === 'tratamiento' && (
        <TratamientoModal
          nombreInicial={creando.nombre}
          empresas={[]}
          puedeElegirAlcance={false}
          alcanceFijo={{ tipo: 'empresa' }}
          onClose={() => setCreando(null)}
          onOk={guardarTratamiento}
        />
      )}

      {creando?.tipo === 'insumo' && (
        <InsumoModal
          nombreInicial={creando.nombre}
          categoriaFija={CATEGORIA_VETERINARIA_FIJA}
          alcanceFijo={{ tipo: 'empresa' }}
          categorias={[]}
          empresas={[]}
          puedeElegirAlcance={false}
          onClose={() => setCreando(null)}
          onOk={guardarInsumo}
        />
      )}
    </div>
  )
}
