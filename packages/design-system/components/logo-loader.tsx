import { cn } from "../lib/utils";
import { DELULU_LOGO_OUTLINE, DELULU_LOGO_PATH } from "./logo";

/** CSS-only tracing: completion never holds up the content it was loading. */
export function LogoLoader({
  loading = true,
  size = 48,
  label = "Loading",
  className,
}: {
  loading?: boolean;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <output
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        className
      )}
      data-loading={loading}
      data-slot="logo-loader"
    >
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        viewBox="-8 -8 243 277"
        width={size}
      >
        <path
          d={DELULU_LOGO_OUTLINE}
          opacity="0.16"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          className="logo-loader-trace"
          d={DELULU_LOGO_OUTLINE}
          pathLength="1"
          stroke="currentColor"
          strokeDasharray="0.22 0.78"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="7"
        />
        <path
          className="logo-loader-outline"
          d={DELULU_LOGO_OUTLINE}
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <path
          className="logo-loader-fill"
          clipRule="evenodd"
          d={DELULU_LOGO_PATH}
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
    </output>
  );
}
