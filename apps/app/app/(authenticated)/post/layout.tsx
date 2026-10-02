import type { ReactNode } from "react";
import { StoreProvider } from "@/features/publishing/store-provider";

export default function EditorLayout({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
