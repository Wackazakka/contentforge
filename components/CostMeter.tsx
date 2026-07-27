'use client'

import { fmtNok } from '@/lib/costs'

// Flytende taxameter — fast nede til høyre, følger deg rundt på siden og
// oppdateres live for hvert valg. Brukes på manus-editoren og avatar-siden.
export default function CostMeter({
  paalopt,
  lines,
}: {
  paalopt?: number
  lines: Array<{ label: string; amount: number }>
}) {
  const visible = lines.filter((l) => l.amount > 0)
  const estimat = visible.reduce((s, l) => s + l.amount, 0)
  if (!paalopt && estimat === 0) return null

  return (
    <div className="fixed bottom-24 right-4 z-40 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-xl px-4 py-3 text-sm w-56">
      <div className="font-semibold text-gray-900 mb-1">💰 Taxameter</div>
      {typeof paalopt === 'number' && paalopt > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Påløpt</span>
          <span className="font-medium">{fmtNok(paalopt)}</span>
        </div>
      )}
      {visible.map((l) => (
        <div key={l.label} className="flex justify-between text-gray-600">
          <span>{l.label}</span>
          <span>~{fmtNok(l.amount)}</span>
        </div>
      ))}
      {estimat > 0 && (
        <div className="flex justify-between border-t border-gray-100 mt-1 pt-1 text-gray-900 font-medium">
          <span>Neste produksjon</span>
          <span>~{fmtNok(estimat)}</span>
        </div>
      )}
    </div>
  )
}
