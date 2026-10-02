import { LogoLoader } from "@delulu/design-system/components/logo-loader";

export function PageLoading({
  label = "Loading workspace",
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center p-8">
      <LogoLoader className="text-primary" label={label} />
    </div>
  );
}
