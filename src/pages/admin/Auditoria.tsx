import { useState } from 'react'
import { Search, Shield, Download } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import Timeline from '@/components/shared/Timeline'
import { useAuditLogs, useUsers } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import type { AuditAction } from '@/types'

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Login',
  logout: 'Logout',
  create_draft_order:    'Salvar rascunho',
  update_draft_order:    'Editar rascunho',
  delete_draft_order:    'Excluir rascunho',
  generate_order:        'Gerar pedido',
  generate_spreadsheet:  'Gerar planilha',
  send_to_separation:    'Enviar separação',
  print_separation_pdf:  'Imprimir separação',
  invoice_ready_to_ship: 'Faturar pedido',
  mark_as_delivered:     'Marcar entregue',
  update_order_admin:    'Editar pedido (admin)',
  create_order:          'Criar pedido',
  update_order:          'Editar pedido',
  cancel_order:          'Cancelar pedido',
  create_exchange_order: 'Criar pedido de troca',
  update_exchange_order: 'Editar pedido de troca',
  change_order_type:     'Alterar tipo do pedido',
  create_visit: 'Nova visita',
  checkin: 'Check-in',
  checkout: 'Check-out',
  update_client: 'Editar cliente',
  assume_prospect: 'Assumir lead',
  convert_prospect: 'Converter lead',
  sync_bling: 'Sync Bling',
  transfer_client: 'Transferir cliente',
  create_client: 'Criar cliente',
  create_product: 'Criar produto',
  update_product: 'Editar produto',
  create_attribute:         'Criar atributo',
  update_attribute:         'Editar atributo',
  create_attribute_value:   'Criar valor de atributo',
  update_attribute_value:   'Editar valor de atributo',
  assign_product_attributes:'Vincular atributos ao produto',
  create_category:         'Criar categoria',
  update_category:         'Editar categoria',
  create_subcategory:      'Criar subcategoria',
  update_subcategory:      'Editar subcategoria',
  change_product_category: 'Alterar categoria do produto',
  register_payment:             'Registrar pagamento',
  delete_financial_title:       'Excluir título financeiro',
  delete_order_and_financial:   'Excluir pedido + financeiro',
  delete_order_keep_financial:  'Excluir pedido (manter financeiro)',
  payment_method_changed:       'Forma de pagamento alterada',
  partial_payment_registered:   'Pagamento parcial registrado',
  partial_delivery_registered:  'Entrega parcial registrada',
  delivery_completed:           'Entrega concluída',
  administrative_adjustment:    'Ajuste administrativo',
  financial_generated:          'Financeiro gerado',
  financial_recalculated:       'Financeiro recalculado',
  financial_deleted:            'Financeiro excluído',
  commission_generated:         'Comissão gerada',
  create_retroactive_order:     'Pedido retroativo criado',
  update_sale_date:             'Data da venda alterada',
  recalculate_financial:        'Financeiro reprocessado',
  create_check_payment:         'Cheque adicionado',
  update_check_payment:         'Cheque editado',
  delete_check_payment:         'Cheque removido',
  create_installment:           'Parcela adicionada',
  update_installment:           'Parcela editada',
  delete_installment:           'Parcela removida',
  recalculate_installments:     'Parcelas recalculadas',
  change_delivery_date:         'Data de entrega alterada',
  create_task:                  'Criar tarefa',
  update_task:             'Editar tarefa',
  delete_task:             'Excluir tarefa',
  complete_task:           'Concluir tarefa',
  delete_order:            'Excluir pedido',
  restore_order:           'Restaurar pedido',
  create_seamstress:            'Cadastrar costureira',
  update_seamstress:            'Editar costureira',
  delete_seamstress:            'Remover costureira',
  create_production_order:      'Nova ordem de produção',
  update_production_order:      'Editar ordem de produção',
  cancel_production_order:      'Cancelar ordem de produção',
  register_production_delivery: 'Registrar entrega',
  create_production_payment:    'Novo fechamento',
  mark_production_paid:         'Pagamento confirmado',
  create_production_request:    'Nova solicitação',
  update_production_request:    'Editar solicitação',
  complete_production_request:  'Solicitação concluída',
  delete_production_request:    'Solicitação excluída',
  delete_production_payment:    'Fechamento excluído',
}

export default function AdminAuditoria() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'todos'>('todos')
  const [repFilter, setRepFilter] = useState('todos')

  const { data: allLogs = [], loading } = useAuditLogs()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep')

  const filtered = allLogs.filter(log => {
    const matchSearch = log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.description.toLowerCase().includes(search.toLowerCase())
    const matchAction = actionFilter === 'todos' || log.action === actionFilter
    const matchRep = repFilter === 'todos' || log.userId === repFilter
    return matchSearch && matchAction && matchRep
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const uniqueActions = [...new Set(allLogs.map(l => l.action))] as AuditAction[]

  if (loading) return <AdminLayout title="Auditoria"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Auditoria">
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-400" />
            <span className="text-sm text-slate-500">{allLogs.length} eventos registrados</span>
          </div>
          <button className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Exportar log
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuário ou descrição..."
              className="input pl-10"
            />
          </div>

          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-36">
            <option value="todos">Todos usuários</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
          </select>

          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value as AuditAction | 'todos')}
            className="input w-auto min-w-44"
          >
            <option value="todos">Todas as ações</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>

        {/* Timeline */}
        <div className="card p-5">
          <Timeline logs={filtered} />
        </div>
      </div>
    </AdminLayout>
  )
}
