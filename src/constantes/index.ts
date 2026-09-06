export const Roles = {
  SYS_ADMIN: 'sys-admin',
  ANFITRION: 'anfitrion',
  OPERARIO: 'operario',
  CLIENTE: 'cliente',
} as const;

export const ROLES_LABELS: Record<string, string> = {
  [Roles.SYS_ADMIN]: 'Admin',
  [Roles.ANFITRION]: 'Anfitrión',
  [Roles.OPERARIO]: 'Operario',
  [Roles.CLIENTE]: 'Cliente',
};

export function getRoleLabel(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return ''
  for (const role of roles) {
    if (ROLES_LABELS[role]) return ROLES_LABELS[role]
  }
  return ''
}

/** idRol (roles/{id} en Firestore): 1=sys-admin, 2=anfitrion, 3=operario, 4=cliente. */
export const ID_ROL_ANFITRION = 2
export const ID_ROL_OPERARIO = 3
export const ID_ROL_CLIENTE = 4

/** Roles que sys-admin puede asignar a un usuario nuevo (sin rol). */
export const ROL_ASIGNABLE_OPTIONS: { value: number; label: string; role: string }[] = [
  { value: ID_ROL_ANFITRION, label: 'Anfitrión', role: Roles.ANFITRION },
  { value: ID_ROL_OPERARIO, label: 'Operario', role: Roles.OPERARIO },
  { value: ID_ROL_CLIENTE, label: 'Cliente', role: Roles.CLIENTE },
]

/** Tipos de corral. Común: aloja un lote (estado libre/ocupado derivado).
 *  Enfermería: sin estado, recibe animales de varios lotes. */
export const CORRAL_TIPOS = {
  COMUN: 'comun',
  ENFERMERIA: 'enfermeria',
} as const

export const CORRAL_TIPO_LABELS: Record<string, string> = {
  [CORRAL_TIPOS.COMUN]: 'Común',
  [CORRAL_TIPOS.ENFERMERIA]: 'Enfermería',
}

/** Estados sanitarios del animal. */
export const ESTADOS_ANIMAL = ['sano', 'enfermo', 'muerto'] as const

export const ESTADO_ANIMAL_LABELS: Record<string, string> = {
  sano: 'Sano',
  enfermo: 'Enfermo',
  muerto: 'Muerto',
}

/**
 * Paleta de colores por lote (replica la PALETA_LOTE del server). El mapa de
 * corrales pinta la ficha de cada animal con el color de su lote.
 */
export const PALETA_LOTE = [
  '#8B5E34', // marrón (marca)
  '#2F6F4F', // verde
  '#B45309', // ámbar
  '#1D4ED8', // azul
  '#7C3AED', // violeta
  '#DB2777', // rosa
  '#0F766E', // teal
  '#B91C1C', // rojo
  '#57534E', // piedra
  '#A16207', // oliva
] as const

/** Color para lotes históricos sin color asignado. */
export const COLOR_LOTE_FALLBACK = '#57534E'

export function getLoteColor(color: string | null | undefined): string {
  return color ?? COLOR_LOTE_FALLBACK
}