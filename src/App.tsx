import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { SyncProvider } from '@/contexts/SyncContext'
import { RequireAuth, RedirectIfLoggedIn } from '@/routes'

import Login from '@/pages/auth/Login'

import RepHome from '@/pages/rep/Home'
import RotaDoDia from '@/pages/rep/RotaDoDia'
import RepClientes from '@/pages/rep/Clientes'
import ClienteDetalhes from '@/pages/rep/ClienteDetalhes'
import RepVisitas from '@/pages/rep/Visitas'
import RepCRM from '@/pages/rep/CRM'
import RepProspectPerfil from '@/pages/rep/ProspectPerfil'
import RepPedidos from '@/pages/rep/Pedidos'
import NovoPedido from '@/pages/rep/NovoPedido'
import PedidoDetalhes from '@/pages/rep/PedidoDetalhes'
import RepComissao from '@/pages/rep/Comissao'
import RepPerfil from '@/pages/rep/Perfil'

import AdminDashboard from '@/pages/admin/Dashboard'
import AdminRepresentantes from '@/pages/admin/Representantes'
import AdminRepDetalhes from '@/pages/admin/AdminRepDetalhes'
import AdminClientes from '@/pages/admin/AdminClientes'
import AdminClienteDetalhes from '@/pages/admin/AdminClienteDetalhes'
import AdminPedidos from '@/pages/admin/AdminPedidos'
import AdminPedidoDetalhes from '@/pages/admin/AdminPedidoDetalhes'
import AdminVisitas from '@/pages/admin/AdminVisitas'
import AdminRelatorios from '@/pages/admin/Relatorios'
import AdminAuditoria from '@/pages/admin/Auditoria'
import AdminSincronizacao from '@/pages/admin/Sincronizacao'
import AdminConfiguracoes from '@/pages/admin/Configuracoes'
import AdminCRM from '@/pages/admin/AdminCRM'
import ProspectDetalhes from '@/pages/admin/ProspectDetalhes'
import AdminProdutos from '@/pages/admin/Produtos'
import Aniversariantes from '@/pages/rep/Aniversariantes'
import AdminAniversariantes from '@/pages/admin/AdminAniversariantes'
import AdminFinanceiro from '@/pages/admin/AdminFinanceiro'
import AdminTarefas from '@/pages/admin/AdminTarefas'
import RepTarefas from '@/pages/rep/Tarefas'
import ProducaoDashboard from '@/pages/producao/ProducaoDashboard'
import Costureiras from '@/pages/producao/Costureiras'
import CostureiraDetalhes from '@/pages/producao/CostureiraDetalhes'
import OrdensProducao from '@/pages/producao/OrdensProducao'
import OrdemDetalhes from '@/pages/producao/OrdemDetalhes'
import PagamentosProducao from '@/pages/producao/PagamentosProducao'
import SolicitacoesProducao from '@/pages/producao/SolicitacoesProducao'
import RelatoriosProducao from '@/pages/producao/RelatoriosProducao'
import FluxosProducao from '@/pages/producao/FluxosProducao'
import ProducaoLayout from '@/layouts/ProducaoLayout'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <Routes>
            {/* Public */}
            <Route element={<RedirectIfLoggedIn />}>
              <Route path="/login" element={<Login />} />
            </Route>

            {/* Representative routes */}
            <Route element={<RequireAuth role="rep" />}>
              <Route path="/rep" element={<RepHome />} />
              <Route path="/rep/rota" element={<RotaDoDia />} />
              <Route path="/rep/clientes" element={<RepClientes />} />
              <Route path="/rep/clientes/:id" element={<ClienteDetalhes />} />
              <Route path="/rep/visitas" element={<RepVisitas />} />
              <Route path="/rep/crm" element={<RepCRM />} />
              <Route path="/rep/crm/:id" element={<RepProspectPerfil />} />
              <Route path="/rep/pedidos" element={<RepPedidos />} />
              <Route path="/rep/pedidos/novo" element={<NovoPedido />} />
              <Route path="/rep/pedidos/:id" element={<PedidoDetalhes />} />
              <Route path="/rep/comissao" element={<RepComissao />} />
              <Route path="/rep/perfil" element={<RepPerfil />} />
              <Route path="/rep/aniversariantes" element={<Aniversariantes />} />
              <Route path="/rep/tarefas" element={<RepTarefas />} />
            </Route>

            {/* Admin routes */}
            <Route element={<RequireAuth role="admin" />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/representantes" element={<AdminRepresentantes />} />
              <Route path="/admin/representantes/:id" element={<AdminRepDetalhes />} />
              <Route path="/admin/clientes" element={<AdminClientes />} />
              <Route path="/admin/clientes/:id" element={<AdminClienteDetalhes />} />
              <Route path="/admin/pedidos" element={<AdminPedidos />} />
              <Route path="/admin/pedidos/:id" element={<AdminPedidoDetalhes />} />
              <Route path="/admin/visitas" element={<AdminVisitas />} />
              <Route path="/admin/relatorios" element={<AdminRelatorios />} />
              <Route path="/admin/auditoria" element={<AdminAuditoria />} />
              <Route path="/admin/sincronizacao" element={<AdminSincronizacao />} />
              <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
              <Route path="/admin/crm" element={<AdminCRM />} />
              <Route path="/admin/crm/:id" element={<ProspectDetalhes />} />
              <Route path="/admin/produtos" element={<AdminProdutos />} />
              <Route path="/admin/aniversariantes" element={<AdminAniversariantes />} />
              <Route path="/admin/financeiro" element={<AdminFinanceiro />} />
              <Route path="/admin/tarefas" element={<AdminTarefas />} />
              {/* Produção — abas de nível superior compartilham um layout
                  persistente (ProducaoLayout) para não perder a posição de
                  scroll ao trocar de aba. Páginas de detalhe (:id) ficam de
                  fora, com navegação normal (reset de scroll esperado). */}
              <Route element={<ProducaoLayout />}>
                <Route path="/admin/producao" element={<ProducaoDashboard />} />
                <Route path="/admin/producao/costureiras" element={<Costureiras />} />
                <Route path="/admin/producao/ordens" element={<OrdensProducao />} />
                <Route path="/admin/producao/fluxos" element={<FluxosProducao />} />
                <Route path="/admin/producao/pagamentos" element={<PagamentosProducao />} />
                <Route path="/admin/producao/solicitacoes" element={<SolicitacoesProducao />} />
                <Route path="/admin/producao/relatorios" element={<RelatoriosProducao />} />
              </Route>
              <Route path="/admin/producao/costureiras/:id" element={<CostureiraDetalhes />} />
              <Route path="/admin/producao/ordens/:id" element={<OrdemDetalhes />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
