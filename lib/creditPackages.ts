// Kredittpakker for sluttkunder (white-label): beløpet blir saldo, bonusen er
// volumrabatten. Faste pakker i v1 — per-tenant-pakker kan komme senere.
export const CREDIT_PACKAGES = [
  { id: 'starter', amount: 1000, bonus: 0 },
  { id: 'medium', amount: 5000, bonus: 250 },
  { id: 'stor', amount: 10000, bonus: 1000 },
] as const
