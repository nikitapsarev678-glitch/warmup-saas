'use client'

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type ActionsByDayPoint = {
  date: string
  total: number | string
  success: number | string
  errors: number | string
}

export function ActionsChart({ data }: { data: ActionsByDayPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-gray-400">Нет данных</div>
  }

  const formatted = data.map((item) => ({
    ...item,
    total: Number(item.total),
    success: Number(item.success),
    errors: Number(item.errors),
    date: new Date(item.date).toLocaleDateString('ru-RU', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="success" name="Успешно" fill="#22c55e" stackId="a" />
          <Bar dataKey="errors" name="Ошибки" fill="#ef4444" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
