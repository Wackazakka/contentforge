'use client'

import { fmtCredits } from '@/lib/costs'

// Flytende taxameter — fast nede til høyre, følger deg rundt på siden og
// oppdateres live for hvert valg. Brukes på manus-editoren og avatar-siden.
export default function CostMeter({
  paalopt,
  lines,
  saldo,
}: {
  paalopt?: number
  lines: Array<{ label: string; amount: number }>
  saldo?: number | null // forskuddssaldo; null/undefined = ingen konto → skjules
}) {
  const visible = lines.filter((l) => l.amount > 0)
  const estimat = visible.reduce((s, l) => s + l.amount, 0)
  if (!paalopt && estimat === 0) return null
  const dekning = typeof saldo === 'number' ? saldo >= estimat : null

  return (
    <div className="fixed bottom-24 right-4 z-40 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-xl px-4 py-3 text-sm w-56">
      <div className="font-semibold text-gray-900 mb-1">💰 Taxameter</div>
      {typeof paalopt === 'number' && paalopt > 0 && (
        <div className="flex justify-between text-gray-600">
          <span>Påløpt</span>
          <span className="font-medium">{fmtCredits(paalopt)}</span>
        </div>
      )}
      {visible.map((l) => (
        <div key={l.label} className="flex justify-between text-gray-600">
          <span>{l.label}</span>
          <span>~{fmtCredits(l.amount)}</span>
        </div>
      ))}
      {estimat > 0 && (
        <>
          <div className="flex justify-between border-t border-gray-100 mt-1 pt-1 text-gray-900 font-medium">
            <span>Neste produksjon</span>
            <span>~{fmtCredits(estimat)}</span>
          </div>
          {/* Estimatet faller når du bruker egne bilder/klipp — si det, ellers
              ser en synkende sum ut som en feil (Lars 31/7) */}
          <div className="text-xs text-gray-400 mt-0.5 leading-snug">
            Det du lager selv — egne bilder, egen stemme — er gratis og trekker summen ned.
          </div>
        </>
      )}
      {typeof saldo === 'number' && (
        <>
          <div className={`flex justify-between border-t border-gray-100 mt-1 pt-1 font-medium ${dekning === false ? 'text-red-600' : 'text-green-700'}`}>
            <span>På konto</span>
            <span>{fmtCredits(saldo)}</span>
          </div>
          {dekning === false && (
            <div className="text-xs text-red-600 mt-0.5">
              Ikke dekning for neste produksjon — kjøp mer kreditt.
            </div>
          )}
        </>
      )}
    </div>
  )
}
