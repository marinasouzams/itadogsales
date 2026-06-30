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
import RepProspects from '@/pages/rep/Prospects'
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
import AdminProspects from '@/pages/admin/AdminProspects'
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
              <Route path="/rep/prospects" element={<RepProspects />} />
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
              <Route path="/admin/prospects" element={<AdminProspects />} />
              <Route path="/admin/prospects/:id" element={<ProspectDetalhes />} />
              <Route path="/admin/produtos" element={<AdminProdutos />} />
              <Route path="/admin/aniversariantes" element={<AdminAniversariantes />} />
              <Route path="/admin/financeiro" element={<AdminFinanceiro />} />
              <Route path="/admin/tarefas" element={<AdminTarefas />} />
              {/* Produção */}
              <Route path="/admin/producao" element={<ProducaoDashboard />} />
              <Route path="/admin/producao/costureiras" element={<Costureiras />} />
              <Route path="/admin/producao/costureiras/:id" element={<CostureiraDetalhes />} />
              <Route path="/admin/producao/ordens" element={<OrdensProducao />} />
              <Route path="/admin/producao/ordens/:id" element={<OrdemDetalhes />} />
              <Route path="/admin/producao/pagamentos" element={<PagamentosProducao />} />
              <Route path="/admin/producao/solicitacoes" element={<SolicitacoesProducao />} />
              <Route path="/admin/producao/relatorios" element={<RelatoriosProducao />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
