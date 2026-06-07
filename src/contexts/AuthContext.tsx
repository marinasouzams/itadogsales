import {
  createContext, useContext, useState, useCallback,
  useEffect, type ReactNode
} from 'react'
import type { User } from '@/types'
import { MOCK_USERS } from '@/mock/data'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  loginAsDemo: (role: 'admin' | 'rep') => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Convert Supabase profile row → app User type
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
      const stored = localStorage.getItem('ita_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)

  const persist = useCallback((u: User | null) => {
    if (u) localStorage.setItem('ita_user', JSON.stringify(u))
    else localStorage.removeItem('ita_user')
    setUser(u)
  }, [])

  // ── Supabase: sincroniza sessão ao iniciar ──────────────────
  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (profile) persist(profileToUser(profile as Record<string, unknown>))
      }
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (profile) persist(profileToUser(profile as Record<string, unknown>))
      }
      if (event === 'SIGNED_OUT') {
        persist(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [persist])

  // ── LOGIN ─────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)

    // Supabase auth
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setIsLoading(false)
        return { success: false, error: 'E-mail ou senha incorretos.' }
      }
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
        if (profile) persist(profileToUser(profile as Record<string, unknown>))
        setIsLoading(false)
        return { success: true }
      }
    }

    // Fallback mock
    await new Promise(r => setTimeout(r, 800))
    const found = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase())
    setIsLoading(false)
    if (found) {
      persist(found)
      return { success: true }
    }
    return { success: false, error: 'E-mail ou senha incorretos.' }
  }, [persist])

  // ── DEMO LOGIN (apenas mock) ───────────────────────────────
  const loginAsDemo = useCallback((role: 'admin' | 'rep') => {
    const u = MOCK_USERS.find(u => u.role === role)
    if (u) persist(u)
  }, [persist])

  // ── LOGOUT ────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    persist(null)
  }, [persist])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginAsDemo, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
