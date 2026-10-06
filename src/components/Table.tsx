import type { ReactNode } from 'react'

interface Column<T> {
  header: string
  accessor: keyof T | ((item: T) => ReactNode)
}

interface TableProps<T> {
  data: T[]
  columns: Column<T>[]
  actions?: ReactNode
  emptyMessage?: string
  /** Fila clickeable (los botones interiores deben detener la propagación). */
  onRowClick?: (item: T) => void
  /** Filas más bajas (celdas con menos padding vertical). */
  compacto?: boolean
}

export function Table<T>({ data, columns, actions, emptyMessage = 'No hay datos disponibles.', onRowClick, compacto = false }: TableProps<T>) {
  return (
    <div className="premium-card overflow-hidden">
      {actions && (
        <div className="flex justify-end items-center gap-2 p-4 border-b border-border">
          {actions}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/60">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`text-left px-4 ${compacto ? 'py-2' : 'py-3'} text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border whitespace-nowrap`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((item, ri) => (
                <tr
                  key={ri}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  className={`hover:bg-muted/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((col, ci) => (
                    <td key={ci} className={`px-4 ${compacto ? 'py-1.5' : 'py-3'} text-sm text-foreground border-b border-border last:border-b-0`}>
                      {typeof col.accessor === 'function'
                        ? col.accessor(item)
                        : (item[col.accessor] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-sm text-muted-foreground italic">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}