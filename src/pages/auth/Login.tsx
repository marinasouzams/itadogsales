import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Zap, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AuthLayout from '@/layouts/AuthLayout'
import { cn } from '@/utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const { login, loginAsDemo, isLoading } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      const user = JSON.parse(localStorage.getItem('ita_user') ?? '{}')
      navigate(user.role === 'admin' ? '/admin' : '/rep')
    } else {
      setError(result.error ?? 'Erro ao fazer login')
    }
  }

  const handleDemo = (role: 'admin' | 'rep') => {
    loginAsDemo(role)
    navigate(role === 'admin' ? '/admin' : '/rep')
  }

  return (
    <AuthLayout>
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm mb-4">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">ITA Dog Sales</h1>
        <p className="text-white/60 text-sm mt-1">Força de Vendas Agropecuária</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-modal p-7">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Bem-vindo de volta</h2>
        <p className="text-sm text-slate-500 mb-6">Acesse sua conta para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com.br"
              className={cn('input', error && 'border-red-300 focus:border-red-400 focus:ring-red-100')}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">Senha</label>
              <button type="button" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                Esqueceu?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={cn('input pr-12', error && 'border-red-300')}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="btn-primary w-full h-12 text-base mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Entrar
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs text-slate-400 font-medium">Acesso rápido para demo</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {/* Demo buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleDemo('admin')}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-100 hover:border-primary-200 hover:bg-primary-50 transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
              <span className="text-lg">👤</span>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-slate-800">Admin</div>
              <div className="text-[10px] text-slate-500">Dashboard completo</div>
            </div>
          </button>
          <button
            onClick={() => handleDemo('rep')}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-100 hover:border-primary-200 hover:bg-primary-50 transition-all duration-200 group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
              <span className="text-lg">🚗</span>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-slate-800">Representante</div>
              <div className="text-[10px] text-slate-500">Visão em campo</div>
            </div>
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5">
          Demo: qualquer e-mail/senha · Clique nos botões acima
        </p>
      </div>

      {/* Footer */}
      <p className="text-center text-white/40 text-xs mt-6">
        © 2025 ITA Dog Sales · v1.0.0
      </p>
    </AuthLayout>
  )
}
