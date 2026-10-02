import type { ThemeProviderProps } from "next-themes";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ThemeProvider } from "./providers/theme";

export { useTheme } from "next-themes";

/** UI providers only. Authentication and telemetry belong to each application. */
export const DesignSystemProvider = ({
  children,
  ...props
}: ThemeProviderProps) => (
  <ThemeProvider {...props}>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster />
  </ThemeProvider>
);
