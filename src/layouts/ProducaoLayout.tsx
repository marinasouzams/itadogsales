import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import NotificationPanel from '@/components/shared/NotificationPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { cn, getAvatarColor, getInitials } from '@/utils'
import { SidebarContent } from './AdminLayout'

// Título de topbar por rota — evita que cada aba precise repassar um prop de
// título para este layout (ele já sabe pela própria URL).
const TITLE_BY_PATH: Record<string, string> = {
  '/admin/producao': 'Dashboard Produção',
  '/admin/producao/costureiras': 'Costureiras',
  '/admin/producao/ordens': 'Ordens de Produção',
  '/admin/producao/fluxos': 'Fluxos de Produção',
  '/admin/producao/pagamentos': 'Pagamentos Produção',
  '/admin/producao/solicitacoes': 'Solicitações',
  '/admin/producao/relatorios': 'Relatórios de Produção',
}

/**
 * Layout persistente para as abas de nível superior do módulo Produção
 * (Dashboard, Costureiras, Ordens, Fluxos, Pagamentos, Solicitações,
 * Relatórios). Ao contrário do AdminLayout — que cada página instancia por
 * conta própria e por isso remonta por inteiro a cada navegação — este
 * layout é montado UMA VEZ na rota pai (/admin/producao) e as 7 abas
 * trocam apenas o conteúdo via <Outlet/>. Isso corrige o scroll voltando
 * ao topo ao trocar de aba: sidebar e o container principal nunca
 * desmontam, e a posição de scroll de cada aba é lembrada individualmente.
 *
 * Páginas de detalhe (costureiras/:id, ordens/:id) NÃO usam este layout —
 * continuam com <AdminLayout> normal, já que abrir um detalhe é navegação
 * de "nova página" de verdade (resetar o scroll ali é o comportamento
 * esperado).
 */
export default function ProducaoLayout() {
  const { user, logout } = useAuth()
  const { status, pendingCount } = useSync()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const title = TITLE_BY_PATH[pathname]

  const mainRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Map<string, number>>(new Map())
  const currentPathRef = useRef(pathname)

  // Guarda a posição de scroll de cada aba CONTINUAMENTE (a cada scroll),
  // não apenas no momento da troca — o React já substitui os filhos do
  // <main> (e o navegador zera o scrollTop) antes do efeito de troca de
  // rota rodar, então tentar "salvar no momento da saída" sempre lia 0.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const onScroll = () => scrollPositions.current.set(currentPathRef.current, main.scrollTop)
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    currentPathRef.current = pathname

    // Aguarda o conteúdo da nova aba montar/renderizar antes de restaurar
    // (o Outlet troca de componente de forma síncrona, mas dados assíncronos
    // podem alterar a altura logo em seguida — dois rAF cobrem o caso comum).
    const restore = () => {
      if (!mainRef.current) return
      mainRef.current.scrollTop = scrollPositions.current.get(pathname) ?? 0
    }
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(restore) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh bg-slate-50">
      {/* Desktop Sidebar — persistent, never remounts */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-900 flex-shrink-0">
        <SidebarContent user={user} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-slate-900 lg:hidden"
              initial={{ x: -264 }}
              animate={{ x: 0 }}
              exit={{ x: -264 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarContent user={user} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0 z-20 safe-top">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500">
              <span>Admin Console</span>
              {title && <><span className="text-slate-300">/</span><span className="font-medium text-slate-700">{title}</span></>}
            </div>
            {title && <span className="lg:hidden text-sm font-semibold text-slate-800">{title}</span>}
          </div>

          <div className="flex items-center gap-2">
            <div
              className={cn(
                'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                status === 'online' && pendingCount === 0
                  ? 'bg-green-50 text-green-700'
                  : status === 'offline'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700',
              )}
            >
              {status === 'offline' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {pendingCount > 0 ? `${pendingCount} pendentes` : 'Conectado'}
            </div>

            <NotificationPanel />

            <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold', getAvatarColor(user?.name ?? 'A'))}>
                {getInitials(user?.name ?? 'A')}
              </div>
              <span className="hidden sm:block text-sm font-medium text-slate-700">
                {user?.name?.split(' ')[0]}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Content — nunca desmonta ao trocar entre as abas do módulo Produção */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
