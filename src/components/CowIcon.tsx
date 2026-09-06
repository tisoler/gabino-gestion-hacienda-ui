import type { SVGProps } from 'react'

/**
 * Icono de vaca (frente) en estilo lucide, ya que esa versión de lucide-react
 * no expone un icono "Cow". Placeholder de marca: la imagen final la genera
 * el equipo de diseño.
 */
export function CowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {/* Cuernos */}
      <path d="M6.5 6.5 5 3" />
      <path d="M17.5 6.5 19 3" />
      {/* Contorno de la cabeza */}
      <path d="M6.5 6.5C4.6 7.7 3.6 9.9 3.6 12.3v1c0 3.3 2 5.9 4.5 6.9.4 1.6 1.7 2.5 3.9 2.5s3.5-.9 3.9-2.5c2.5-1 4.5-3.6 4.5-6.9v-1c0-2.4-1-4.6-2.9-5.8" />
      {/* Manchas */}
      <path d="M7.6 7c.9 0 1.5.6 1.5 1.4 0 .8-.6 1.4-1.5 1.4s-1.5-.6-1.5-1.4S6.7 7 7.6 7Z" fill="currentColor" stroke="none" />
      <path d="M16.4 8.6c.9 0 1.5.6 1.5 1.4 0 .8-.6 1.4-1.5 1.4s-1.5-.6-1.5-1.4.6-1.4 1.5-1.4Z" fill="currentColor" stroke="none" />
      {/* Ojos */}
      <circle cx="9.3" cy="11" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11" r="0.8" fill="currentColor" stroke="none" />
      {/* Morro */}
      <path d="M9 14.6c1.7 1.6 4.3 1.6 6 0" />
      <circle cx="10.8" cy="14.7" r="0.35" fill="currentColor" stroke="none" />
      <circle cx="13.2" cy="14.7" r="0.35" fill="currentColor" stroke="none" />
    </svg>
  )
}