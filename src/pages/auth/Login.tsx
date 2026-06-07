import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AuthLayout from '@/layouts/AuthLayout'
import { cn } from '@/utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.success) {
      const user = JSON.parse(localStorage.getItem('ita_auth_user') ?? '{}')
      navigate(user.role === 'admin' ? '/admin' : '/rep')
    } else {
      setError(result.error ?? 'Erro ao fazer login')
    }
  }

  return (
    <AuthLayout>
      {/* Logo */}
      <div className="text-center mb-8">
        <img
          src="/logo.png"
          alt="ITADOG"
          className="h-14 w-auto object-contain mx-auto mb-4 drop-shadow-lg"
          draggable={false}
        />
        <p className="text-white font-bold text-lg tracking-wide">ITADOG SALES</p>
        <p className="text-white/60 text-sm mt-0.5">Sistema de Força de Vendas</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-modal p-7">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Bem-vindo de volta</h2>
        <p className="text-sm text-slate-500 mb-6">Acesse sua conta para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">Senha</label>
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
            className="btn-primary w-full h-12 text-base mt-2 flex items-center justify-center gap-2"
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
      </div>

      <p className="text-center text-white/40 text-xs mt-6">
        © 2025 ITADOG SALES · v1.0.0
      </p>
    </AuthLayout>
  )
}
