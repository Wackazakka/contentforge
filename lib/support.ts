// Supportsiden (/hjelp, Lars 21.10.2026). Delt av siden og /api/support.
// Rutefiler i Next kan ikke eksportere egne konstanter, derfor bor de her.

export const SUPPORT_KATEGORIER = ['Spørsmål', 'Noe virker ikke', 'Forslag'] as const

// Henvendelsene går hit (Lars bekreftet at adressen tar imot post 21.10)
export const SUPPORT_MOTTAKER = 'lars@norditech.io'

// Strengere enn RFC med vilje: adressen brukes i et PostgREST-filter (.or),
// så komma, parenteser og anførselstegn må aldri slippe gjennom.
export const EPOST_MONSTER = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
