type Props = {
  name?: string | null;
  /** Visual style: `solid` for image overlays, `subtle` for inline content. */
  variant?: "solid" | "subtle";
  className?: string;
};

/**
 * Small pill displaying a book category. Designed to overlay cover images
 * (variant="solid") or sit inline alongside metadata (variant="subtle").
 */
export default function CategoryTag({
  name,
  variant = "subtle",
  className = "",
}: Props) {
  if (!name) return null;
  const base =
    "inline-flex items-center gap-1.5 max-w-full text-xs font-medium px-2 py-0.5 rounded-full";
  const style =
    variant === "solid"
      ? "bg-neutral-900/85 backdrop-blur-md text-white"
      : "bg-neutral-100 text-neutral-700 border border-neutral-200";
  return (
    <span className={`${base} ${style} ${className}`}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 14 14"
        fill="none"
        className="shrink-0"
        aria-hidden
      >
        <path
          d="M2 3.5a1.5 1.5 0 0 1 1.5-1.5h3.379a1.5 1.5 0 0 1 1.06.44l3.621 3.62a1.5 1.5 0 0 1 0 2.122l-3.379 3.378a1.5 1.5 0 0 1-2.121 0L2.44 7.94A1.5 1.5 0 0 1 2 6.879V3.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="4.75" cy="4.75" r="0.85" fill="currentColor" />
      </svg>
      <span className="truncate">{name}</span>
    </span>
  );
}
