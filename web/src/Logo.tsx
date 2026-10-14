// The mark: a four-point shuriken with a hollow center. The wordmark is Sora.
export function Mark({ size = 28, ink = "#111113" }: { size?: number; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1 L19.5 12.5 L31 16 L19.5 19.5 L16 31 L12.5 19.5 L1 16 L12.5 12.5 Z" fill="#b4a9f7" />
      <circle cx="16" cy="16" r="3" fill={ink} />
    </svg>
  );
}

export function Logo({ size = 28, ink }: { size?: number; ink?: string }) {
  return (
    <span className="logo">
      <Mark size={size} ink={ink} />
      <b>Shinobi</b>
    </span>
  );
}
