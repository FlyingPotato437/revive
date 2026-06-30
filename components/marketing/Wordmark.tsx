export function Wordmark({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`display inline-flex items-end text-ink ${className}`}
      style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}
    >
      Revive
      <span
        className="rounded-full bg-cobalt"
        style={{
          width: Math.max(4, size * 0.16),
          height: Math.max(4, size * 0.16),
          marginLeft: size * 0.07,
          marginBottom: size * 0.16,
        }}
      />
    </span>
  );
}
