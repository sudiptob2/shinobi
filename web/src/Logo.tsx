// The mark: a four-point shuriken with a hollow center, in the current text color. The wordmark is Sora.
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1 L19.5 12.5 L31 16 L19.5 19.5 L16 31 L12.5 19.5 L1 16 L12.5 12.5 Z" fill="currentColor" />
      <circle cx="16" cy="16" r="3" fill="var(--bg)" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} />
      <b>Shinobi</b>
    </span>
  );
}
