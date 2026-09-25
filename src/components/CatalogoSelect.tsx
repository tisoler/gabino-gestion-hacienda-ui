import useSWR, { useSWRConfig } from 'swr'
import type { ReactNode } from 'react'
import api, { fetcher } from '../lib/api'
import SelectAutocomplete from './SelectAutocomplete'

export type CatalogoTipo =
  | 'raza'
  | 'categoria'
  | 'pelaje'
  | 'proveedor'
  | 'lugar_origen'
  | 'motivo'

export interface CatalogoItem {
  id: number
  nombre: string
  idEmpresa: number | null
  global: boolean
  /** Sólo categoria: 'MACHO' | 'HEMBRA' | null (indistinto). */
  sexo?: string | null
  /** Sólo pelaje: ids de las razas asociadas. */
  razas?: number[]
}

interface CatalogoSelectProps {
  tipo: CatalogoTipo
  label?: string
  placeholder?: string
  /** id del valor del catálogo ('' = sin selección). */
  value: string | number | ''
  onChange: (value: string | number) => void
  disabled?: boolean
  clearable?: boolean
  className?: string
  /** Texto del botón de alta en el buscador. */
  createLabel?: (nombre: string) => string
  /** Filtra las opciones client-side (p.ej. pelajes de una raza). */
  filter?: (item: CatalogoItem) => boolean
  /** Campos extra del POST de alta (p.ej. { sexo } o { idRaza }). */
  createPayload?: () => Record<string, unknown>
  /** Contenido extra del panel "Agregar" (p.ej. select de sexo). */
  renderCreateExtra?: ReactNode
  /** Con una sola opción (tras el filtro) y sin selección, la elige. */
  defaultFirst?: boolean
}

/**
 * Select autocomplete sobre un catálogo multitenant (`/catalogos/:tipo`):
 * ofrece los valores globales + los de la empresa actual y, si lo ingresado
 * no coincide (lowercase), permite agregarlo asociado a la empresa
 * (`POST /catalogos/:tipo`, requiere escritura:lote).
 */
export default function CatalogoSelect({
  tipo,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  clearable = true,
  className,
  createLabel,
  filter,
  createPayload,
  renderCreateExtra,
  defaultFirst,
}: CatalogoSelectProps) {
  const { mutate } = useSWRConfig()
  const { data } = useSWR<CatalogoItem[]>(`/catalogos/${tipo}`, fetcher, {
    revalidateOnFocus: false,
  })

  const opciones = (data || [])
    .filter((c) => (filter ? filter(c) : true))
    .map((c) => ({ value: c.id, label: c.nombre }))

  const crear = async (nombre: string) => {
    const { data: creado } = await api.post<CatalogoItem>(`/catalogos/${tipo}`, {
      nombre,
      ...(createPayload ? createPayload() : {}),
    })
    await mutate(`/catalogos/${tipo}`, undefined, { revalidate: true })
    return creado.id
  }

  return (
    <SelectAutocomplete
      label={label}
      placeholder={placeholder ?? 'Buscar o agregar...'}
      value={value}
      onChange={onChange}
      options={opciones}
      disabled={disabled}
      clearable={clearable}
      className={className}
      defaultFirst={defaultFirst}
      allowCreate
      onCreate={crear}
      createLabel={createLabel}
      renderCreateExtra={renderCreateExtra}
      emptyMessage="No encontrado. Escribí para agregar."
      renderTag={(o) => {
        const item = data?.find((c) => c.id === o.value)
        return item?.global ? (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            Global
          </span>
        ) : null
      }}
    />
  )
}
