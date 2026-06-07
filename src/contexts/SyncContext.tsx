import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type ConnectionStatus = 'online' | 'offline' | 'syncing'

interface PendingItem {
  id: string
  type: 'visit' | 'order' | 'checkin'
  label: string
  createdAt: string
}

interface SyncContextValue {
  status: ConnectionStatus
  pendingItems: PendingItem[]
  pendingCount: number
  addPending: (item: Omit<PendingItem, 'id' | 'createdAt'>) => void
  syncNow: () => Promise<void>
  lastSync: string | null
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('online')
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [lastSync, setLastSync] = useState<string | null>(new Date().toISOString())

  const addPending = useCallback((item: Omit<PendingItem, 'id' | 'createdAt'>) => {
    setPendingItems(prev => [
      ...prev,
      { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
    ])
  }, [])

  const syncNow = useCallback(async () => {
    if (pendingItems.length === 0) return
    setStatus('syncing')
    await new Promise(r => setTimeout(r, 2000))
    setPendingItems([])
    setLastSync(new Date().toISOString())
    setStatus('online')
  }, [pendingItems])

  return (
    <SyncContext.Provider
      value={{
        status,
        pendingItems,
        pendingCount: pendingItems.length,
        addPending,
        syncNow,
        lastSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
