import type { ComponentProps } from "react";
export default function Image({
  fill: _,
  unoptimized: __,
  ...props
}: ComponentProps<"img"> & { fill?: boolean; unoptimized?: boolean }) {
  return <img {...props} />;
}
