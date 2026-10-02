"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAppRouter } from "@/shell/navigation/route-transition";

/** Next handles modified clicks; normal navigation gets immediate shell feedback. */
export function AppLink({
  onNavigate,
  onMouseEnter,
  onFocus,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useAppRouter();
  const warm = () => {
    if (typeof props.href === "string" && props.href.startsWith("/")) {
      router.prefetch(props.href);
    }
  };
  return (
    <Link
      {...props}
      onFocus={(event) => {
        onFocus?.(event);
        warm();
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        warm();
      }}
      onNavigate={(event) => {
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
            event.preventDefault();
          },
        });
        if (!prevented && typeof props.href === "string") {
          event.preventDefault();
          if (props.replace) {
            router.replace(props.href, { scroll: props.scroll });
          } else {
            router.push(props.href, { scroll: props.scroll });
          }
        }
      }}
    />
  );
}
