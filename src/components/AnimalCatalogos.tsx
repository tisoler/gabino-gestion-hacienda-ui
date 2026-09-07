import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '../lib/api'
import { pelajeAptoParaRaza } from '../lib/catalogos'
import CatalogoSelect, { type CatalogoItem } from './CatalogoSelect'
/**
 * Categoría del animal: catálogo con alta inline. Al agregar una categoría
 * nueva se pide el sexo (Macho/Hembra); las existentes lo traen definido
 * (null = indistinto, p.ej. "Ternero/a").
 */
export function CategoriaSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string | number | ''
  onChange: (v: string | number) => void
  disabled?: boolean
  className?: string
}) {
  const [nuevoSexo, setNuevoSexo] = useState<'MACHO' | 'HEMBRA' | ''>('')
  return (
    <CatalogoSelect
      tipo="categoria"
      label="Categoría"
      placeholder="Buscar o agregar categoría..."
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      clearable
      createPayload={() => (nuevoSexo ? { sexo: nuevoSexo } : {})}
      renderCreateExtra={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Sexo:</span>
          <select
            value={nuevoSexo}
            onChange={(e) => setNuevoSexo(e.target.value as 'MACHO' | 'HEMBRA' | '')}
            className="flex-1 px-2 py-1.5 bg-background border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            <option value="">Indistinto</option>
            <option value="MACHO">Macho</option>
            <option value="HEMBRA">Hembra</option>
          </select>
        </div>
      }
    />
  )
}

/** Label con el sexo inferido de la categoría seleccionada. */
export function SexoDeCategoria({ idCategoria }: { idCategoria: string | number | '' }) {
  const { data } = useSWR<CatalogoItem[]>('/catalogos/categoria', fetcher, {
    revalidateOnFocus: false,
  })
  const cat = data?.find((c) => c.id === Number(idCategoria))
  if (!cat) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 self-end mb-1 ${
        cat.sexo
          ? 'text-primary bg-primary-soft'
          : 'text-muted-foreground bg-muted'
      }`}
      title="Sexo inferido de la categoría"
    >
      Sexo:{' '}
      {cat.sexo === 'MACHO' ? 'Macho' : cat.sexo === 'HEMBRA' ? 'Hembra' : 'Indistinto'}
    </span>
  )
}

/**
 * Pelaje del animal (requerido en la práctica): catálogo filtrado por la raza
 * seleccionada (pelajes de la raza + genéricos). Al crearlo con raza seleccionada,
 * queda asociado a esa raza; sin raza, queda genérico.
 */
export function PelajeSelect({
  value,
  onChange,
  idRaza,
  disabled,
}: {
  value: string | number | ''
  onChange: (v: string | number) => void
  idRaza: string | number | ''
  disabled?: boolean
}) {
  const { data } = useSWR<CatalogoItem[]>('/catalogos/pelaje', fetcher, {
    revalidateOnFocus: false,
  })
  const aptos = (data || []).filter((p) => pelajeAptoParaRaza(p, idRaza))
  return (
    <CatalogoSelect
      tipo="pelaje"
      label="Pelaje"
      placeholder="Buscar o agregar pelaje..."
      value={value}
      onChange={onChange}
      disabled={disabled}
      clearable
      filter={(p) => pelajeAptoParaRaza(p, idRaza)}
      createPayload={() => (idRaza ? { idRaza: Number(idRaza) } : {})}
      defaultFirst={!!idRaza && aptos.length === 1}
    />
  )
}
