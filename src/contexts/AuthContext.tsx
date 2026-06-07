import {
  createContext, useContext, useState, useCallback,
  useEffect, type ReactNode
} from 'react'
import type { User } from '@/types'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { logAudit } from '@/services/db'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function profileToUser(profile: Record<string, unknown>): User {
  return {
    id: profile.id as string,
    name: profile.name as string,
    email: profile.email as string,
    role: profile.role as 'admin' | 'rep',
    phone: profile.phone as string | undefined,
    region: profile.region as string | undefined,
    territory: (profile.territory as string[]) ?? [],
    active: profile.active as boolean,
    meta: profile.meta as number | undefined,
    metaAting: profile.meta_ating as number | undefined,
    avatar: profile.avatar_url as string | undefined,
    createdAt: profile.created_at as string,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const s = localStorage.getItem('ita_auth_user')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)

  const persist = useCallback((u: User | null) => {
    if (u) localStorage.setItem('ita_auth_user', JSON.stringify(u))
    else localStorage.removeItem('ita_auth_user')
    setUser(u)
  }, [])

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: p } = await supabase!.from('profiles').select('*').eq('id', session.user.id).single()
        if (p) persist(profileToUser(p as Record<string, unknown>))
      }
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: p } = await supabase!.from('profiles').select('*').eq('id', session.user.id).single()
        if (p) {
          const appUser = profileToUser(p as Record<string, unknown>)
          persist(appUser)
          logAudit({
            userId: appUser.id,
            userName: appUser.name,
            userRole: appUser.role,
            action: 'login',
            entity: 'Sistema',
            entityId: appUser.id,
            description: 'Login realizado',
            timestamp: new Date().toISOString(),
          })
        }
      }
      if (event === 'SIGNED_OUT') persist(null)
    })

    return () => listener.subscription.unsubscribe()
  }, [persist])

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) return { success: false, error: 'Sistema não configurado.' }
    setIsLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setIsLoading(false); return { success: false, error: 'E-mail ou senha incorretos.' } }
    if (data.user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
      if (p) persist(profileToUser(p as Record<string, unknown>))
      setIsLoading(false)
      return { success: true }
    }
    setIsLoading(false)
    return { success: false, error: 'Erro ao carregar perfil.' }
  }, [persist])

  const logout = useCallback(async () => {
    if (user) {
      logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'logout',
        entity: 'Sistema',
        entityId: user.id,
        description: 'Logout realizado',
        timestamp: new Date().toISOString(),
      })
    }
    if (supabase) await supabase.auth.signOut()
    persist(null)
  }, [persist, user])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
