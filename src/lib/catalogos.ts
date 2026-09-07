import type { CatalogoItem } from '../components/CatalogoSelect'

/** true si el pelaje aplica a la raza seleccionada (asociado o genérico). */
export function pelajeAptoParaRaza(
  p: CatalogoItem,
  idRaza: string | number | '',
): boolean {
  if (!idRaza) return true
  return (p.razas?.length ?? 0) === 0 || !!p.razas?.includes(Number(idRaza))
}
