// Bevegelsesstiler per scene (Lars 1/8: «veldig tilfeldig hva resultatet blir
// … veldig glad i å zoome inn. Burde jeg ikke kunne påvirke det?»).
// Prompten var hardkodet til «cinematic camera push-in» — derfor zoomet alt inn.
//
// Munnsperren legges ALLTID på til slutt, uansett hva artisten velger eller
// skriver: uten den begynner folk å synge i klippene (munnjakten 31/7).

export const MOTION_STYLES = [
  { v: 'push-in', label: 'Zoom sakte inn', prompt: 'slow cinematic camera push-in toward the subject' },
  { v: 'pull-out', label: 'Zoom sakte ut', prompt: 'slow cinematic camera pull-back, gradually revealing more of the scene' },
  { v: 'pan-left', label: 'Panorer mot venstre', prompt: 'slow cinematic camera pan to the left across the scene' },
  { v: 'pan-right', label: 'Panorer mot høyre', prompt: 'slow cinematic camera pan to the right across the scene' },
  { v: 'still', label: 'Stå stille (bare liv i bildet)', prompt: 'locked-off camera with no camera movement at all' },
  { v: 'custom', label: 'Beskriv selv …', prompt: '' },
] as const

export type MotionStyle = typeof MOTION_STYLES[number]['v']

// Liv i bildet uten prat — fasiten fra munnjakten 31/7
const LIV = 'Gentle lifelike motion: the person breathes calmly, blinks naturally, subtle small head movement, calm silent expression.'
const MUNNSPERRE = 'The mouth stays completely closed and still the entire time, lips gently pressed together. Not talking, not singing. Photorealistic, no text or letters.'

/**
 * Bygg den fulle prompten for et bevegelsesklipp.
 * @param style  valgt stil (default 'push-in' — som før)
 * @param egen   artistens egen beskrivelse når style === 'custom'
 */
export function buildMotionPrompt(style?: string | null, egen?: string | null): string {
  const valgt = MOTION_STYLES.find((s) => s.v === style)
  const kamera = (style === 'custom' && (egen || '').trim())
    ? (egen as string).trim()
    : (valgt?.prompt || MOTION_STYLES[0].prompt)
  return `${kamera}. ${LIV} ${MUNNSPERRE}`
}

// Statue-prompten for lip-sync-halene er urørt (egen fasit, PR #200) og
// eksporteres her så job-queue har alt ett sted.
export const TAIL_PROMPT =
  'subtle cinematic camera push-in and gentle ambient motion only. The person stays completely still and does NOT talk - mouth closed, no lip movement, no speaking or singing. Photorealistic, no text or letters.'

export const MOTION_NEGATIVE =
  'talking, speaking, singing, moving lips, lip movement, mouth opening and closing, conversation, open mouth, jaw movement, mouthing words, interview, presenting, explaining'
