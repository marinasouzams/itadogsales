import { motion } from 'framer-motion'
import { MapPin, Navigation } from 'lucide-react'
import { cn } from '@/utils'
import type { Client } from '@/types'

interface MapClient {
  id: string
  name: string
  lat: number
  lng: number
  priority?: 'alta' | 'media' | 'baixa'
  status?: string
  visited?: boolean
}

interface MapMockProps {
  clients?: MapClient[]
  className?: string
  height?: string
  showRoute?: boolean
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: 'bg-red-500',
  media: 'bg-amber-500',
  baixa: 'bg-slate-400',
}

function normalize(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (max === min) return (outMin + outMax) / 2
  return ((value - min) / (max - min)) * (outMax - outMin) + outMin
}

export default function MapMock({ clients = [], className, height = 'h-64', showRoute }: MapMockProps) {
  const lats = clients.map(c => c.lat)
  const lngs = clients.map(c => c.lng)

  const minLat = Math.min(...lats, -23)
  const maxLat = Math.max(...lats, -15)
  const minLng = Math.min(...lngs, -52)
  const maxLng = Math.max(...lngs, -44)

  const clientPositions = clients.map(c => ({
    ...c,
    x: normalize(c.lng, minLng, maxLng, 8, 92),
    y: normalize(-c.lat, -maxLat, -minLat, 8, 92),
  }))

  return (
    <div className={cn('relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200', height, className)}>
      {/* Map background */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#94a3b8" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {/* Fake roads */}
        <line x1="20%" y1="0%" x2="40%" y2="100%" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4,4" />
        <line x1="0%" y1="35%" x2="100%" y2="60%" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4,4" />
        <line x1="60%" y1="0%" x2="70%" y2="100%" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3,6" />
        <line x1="0%" y1="70%" x2="100%" y2="30%" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3,6" />
      </svg>

      {/* Background tones */}
      <div className="absolute inset-0">
        <div className="absolute top-[20%] left-[15%] w-[30%] h-[40%] rounded-3xl bg-green-100/60" />
        <div className="absolute top-[50%] left-[50%] w-[35%] h-[30%] rounded-3xl bg-yellow-50/80" />
        <div className="absolute top-[10%] right-[10%] w-[25%] h-[25%] rounded-3xl bg-blue-50/60" />
      </div>

      {/* Route line */}
      {showRoute && clientPositions.length > 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <polyline
            points={clientPositions.map(c => `${c.x}%,${c.y}%`).join(' ')}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="6,4"
            opacity={0.5}
          />
        </svg>
      )}

      {/* Client pins */}
      {clientPositions.map((c, i) => (
        <motion.div
          key={c.id}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
          initial={{ opacity: 0, scale: 0, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: i * 0.08 + 0.2 }}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center',
              c.visited ? 'bg-green-500' : PRIORITY_COLOR[c.priority ?? 'media'],
            )}
          >
            <MapPin className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-white" />
        </motion.div>
      ))}

      {/* Current location */}
      <div className="absolute bottom-4 left-4">
        <div className="relative w-6 h-6">
          <div className="absolute inset-0 rounded-full bg-primary-600 opacity-20 animate-ping" />
          <div className="relative w-6 h-6 rounded-full bg-primary-600 border-2 border-white shadow-lg flex items-center justify-center">
            <Navigation className="w-3 h-3 text-white" />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm border border-slate-100">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" /> Alta prior.
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Média prior.
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" /> Visitado
          </div>
        </div>
      </div>

      {clients.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhum cliente no mapa</p>
          </div>
        </div>
      )}
    </div>
  )
}
