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
    "inline-flex items-center max-w-full h-[26px] text-xs font-medium px-2.5 rounded-full";
  const style =
    variant === "solid"
      ? "bg-neutral-900/85 backdrop-blur-md text-white"
      : "bg-neutral-50 text-neutral-600 border border-neutral-200";
  return (
    <span className={`${base} ${style} ${className}`}>
      <span className="truncate">{name}</span>
    </span>
  );
}
