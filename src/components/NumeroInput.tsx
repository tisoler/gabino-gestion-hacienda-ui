import type { Ref } from 'react'

/**
 * Input numérico controlado sin spinners (subir/bajar) y sin cambio por
 * scroll: la rueda hace blur para que scrollee la vista/contenedor en lugar
 * del campo. Mantiene `type="number"` (teclado numérico, validación nativa).
 */
export function NumeroInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  title,
  disabled,
  readOnly,
  autoFocus,
  inputRef,
  id,
  className = '',
}: {
  value: string | number
  onChange: (v: string) => void
  min?: number
  max?: number
  step?: string | number
  placeholder?: string
  title?: string
  disabled?: boolean
  readOnly?: boolean
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
  id?: string
  className?: string
}) {
  return (
    <input
      type="number"
      id={id}
      ref={inputRef}
      value={value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      className={`[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
    />
  )
}
