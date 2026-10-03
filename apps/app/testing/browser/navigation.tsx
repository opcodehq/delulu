import { type ComponentProps, useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
export const usePathname = () =>
  useSyncExternalStore(subscribe, () => location.pathname);
export const useParams = <T extends Record<string, string | undefined>>() =>
  ({}) as T;
export const useSearchParams = () => new URLSearchParams(location.search);
export const navigate = (url: string) => {
  history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
const router = {
  push: navigate,
  replace: navigate,
  refresh: () => window.dispatchEvent(new Event("fixture:refresh")),
  back: () => history.back(),
  prefetch() {
    /* Route modules are served by Vite in this harness. */
  },
};
export const useRouter = () => router;
export default function Link({
  href,
  onClick,
  onNavigate,
  prefetch: _,
  ...props
}: ComponentProps<"a"> & {
  prefetch?: boolean;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          href?.startsWith("/") &&
          !event.metaKey &&
          !event.ctrlKey
        ) {
          event.preventDefault();
          let prevented = false;
          onNavigate?.({
            preventDefault: () => {
              prevented = true;
            },
          });
          if (!prevented) {
            navigate(href);
          }
        }
      }}
    />
  );
}
