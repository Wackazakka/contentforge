// Kredittpakker for sluttkunder (white-label). 1 kreditt = 1 krone —
// beløpet + bonusen blir saldo (kreditter), og rabatten stiger med størrelsen.
export const CREDIT_PACKAGES = [
  { id: 'starter', amount: 1000, bonus: 0 },      //  0 %
  { id: 'medium', amount: 5000, bonus: 250 },     //  5 %
  { id: 'stor', amount: 10000, bonus: 1000 },     // 10 %
  { id: 'proff', amount: 50000, bonus: 7500 },    // 15 %
  { id: 'byraa', amount: 100000, bonus: 20000 },  // 20 %
] as const
