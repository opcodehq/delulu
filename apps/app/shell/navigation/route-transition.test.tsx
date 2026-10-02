import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Suspense, use, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  RouteContent,
  useAppRouter,
} from "./route-transition";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(cleanup);

it("acknowledges navigation immediately while the next route is suspended", async () => {
  let resolve!: (value: string) => void;
  const route = new Promise<string>((done) => {
    resolve = done;
  });
  function Destination() {
    return <h1>{use(route)}</h1>;
  }
  function Go() {
    const navigation = useAppRouter();
    return (
      <button onClick={() => navigation.push("/posts")} type="button">
        Posts
      </button>
    );
  }
  function App() {
    const [next, setNext] = useState(false);
    router.push.mockImplementation(() => setNext(true));
    return (
      <NavigationProvider>
        <nav>
          <Go />
        </nav>
        <RouteContent>
          <Suspense>{next ? <Destination /> : <h1>Dashboard</h1>}</Suspense>
        </RouteContent>
      </NavigationProvider>
    );
  }
  render(<App />);
  await act(async () => {
    fireEvent.click(screen.getByText("Posts"));
  });
  expect(screen.getByLabelText("Loading page")).toBeTruthy();
  expect(screen.getByRole("navigation")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  await act(async () => resolve("Your posts"));
  expect(
    await screen.findByRole("heading", { name: "Your posts" })
  ).toBeTruthy();
  expect(screen.queryByLabelText("Loading page")).toBeNull();
});
