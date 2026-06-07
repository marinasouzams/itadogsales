import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function RequireAuth({ role }: { role?: 'admin' | 'rep' }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return null

  if (!user) return <Navigate to="/login" replace />

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/rep'} replace />
  }

  return <Outlet />
}

export function RedirectIfLoggedIn() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/rep'} replace />
  return <Outlet />
}
