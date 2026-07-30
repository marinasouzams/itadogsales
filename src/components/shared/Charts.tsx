import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts'
import { formatCurrency } from '@/utils'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']
const GRID_STYLE = { stroke: '#f1f5f9', strokeDasharray: '4 4' }

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {currency ? formatCurrency(p.value) : p.value.toLocaleString('pt-BR')}
        </p>
      ))}
    </div>
  )
}

interface RevenueChartProps {
  data: { month: string; faturamento: number; meta: number }[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip currency />} />
        <Area dataKey="faturamento" name="Faturamento" stroke="#2563eb" strokeWidth={2.5} fill="url(#colorFat)" dot={{ fill: '#2563eb', r: 3 }} activeDot={{ r: 5 }} />
        <Line dataKey="meta" name="Meta" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface VisitsChartProps {
  data: { day: string; visitas: number }[]
}

export function VisitsChart({ data }: VisitsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="visitas" name="Visitas" fill="#2563eb" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface RankingChartProps {
  data: { name: string; faturamento: number; meta: number }[]
}

export function RankingChart({ data }: RankingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barSize={18}>
        <CartesianGrid horizontal={false} {...GRID_STYLE} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<CustomTooltip currency />} />
        <Bar dataKey="faturamento" name="Faturamento" fill="#2563eb" radius={[0, 6, 6, 0]} />
        <Bar dataKey="meta" name="Meta" fill="#e2e8f0" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface FunnelChartProps {
  data: { stage: string; value: number }[]
}

export function FunnelChart({ data }: FunnelChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barSize={20}>
        <CartesianGrid horizontal={false} {...GRID_STYLE} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis dataKey="stage" type="category" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="Prospects" radius={[0, 8, 8, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

interface FlowGroupLineChartProps {
  data: { label: string; quantity: number }[]
}

export function FlowGroupLineChart({ data }: FlowGroupLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line dataKey="quantity" name="Quantidade" stroke="#7c3aed" strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 4 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

interface CommissionDonutProps {
  prevista: number
  aprovada: number
  paga: number
}

export function CommissionDonut({ prevista, aprovada, paga }: CommissionDonutProps) {
  const data = [
    { name: 'Prevista', value: prevista },
    { name: 'Aprovada', value: aprovada },
    { name: 'Paga', value: paga },
  ]
  const DONUT_COLORS = ['#cbd5e1', '#2563eb', '#16a34a']

  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip currency />} />
        <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}
