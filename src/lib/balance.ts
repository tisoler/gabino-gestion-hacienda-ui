import { useSWRConfig } from 'swr'

type MutarGlobal = ReturnType<typeof useSWRConfig>['mutate']

/**
 * Revalida las caches de balance tras un cambio que afecta costos
 * (alimentar, tratar, liquidar, imputar costos, precios de referencia):
 * el detalle del lote (si se indica `loteId`) y SIEMPRE el resumen
 * `/lotes/balances`. Hooks no montados no hacen nada; al montar, SWR trae
 * fresco (stale-while-revalidate).
 */
export async function revalidarBalances(
  mutate: MutarGlobal,
  loteId?: number,
): Promise<void> {
  await mutate(
    (key) =>
      typeof key === 'string' &&
      (key === '/lotes/balances' ||
        (loteId != null && key === `/lotes/${loteId}/balance`)),
    undefined,
    { revalidate: true },
  )
}
