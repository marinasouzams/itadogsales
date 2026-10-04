/** Pago Parcial: o cliente paga uma entrada e o restante nas parcelas do prazo.
 *  Cada parte tem a sua forma de pagamento (o Bling exige uma por parcela). */
export const ENTRY_METHODS = ['PIX', 'Dinheiro', 'Transferência', 'Cheque']
export const BALANCE_METHODS = ['Boleto', 'PIX', 'Dinheiro', 'Transferência', 'Cheque']

/** Erro de preenchimento do Pago Parcial (null = ok). */
export function partialPaymentError(p: { amount: number; total: number; entryMethod?: string; balanceMethod?: string }): string | null {
  if (!(p.amount > 0)) return 'Pago Parcial: informe o valor da entrada.'
  if (p.amount >= p.total) return 'Pago Parcial: a entrada precisa ser menor que o total do pedido.'
  if (!p.entryMethod) return 'Pago Parcial: informe como a entrada foi paga.'
  if (!p.balanceMethod) return 'Pago Parcial: informe como o restante será pago.'
  return null
}
