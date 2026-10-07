/** A grass block with a colour-picker dot: blocks + palettes. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 9 53 21 32 33 11 21z" fill="#7cbd6b" />
      <path d="M11 21 32 33v22L11 43z" fill="#a58651" />
      <path d="M53 21 32 33v22l21-12z" fill="#6b5232" />
      <path d="M32 33v22M11 21l21 12 21-12" stroke="#0f1218" strokeWidth="2" fill="none" />
      <circle cx="47" cy="47" r="10" fill="#4fd1c5" stroke="#0f1218" strokeWidth="3" />
      <circle cx="47" cy="47" r="3.5" fill="#0f1218" />
    </svg>
  )
}
