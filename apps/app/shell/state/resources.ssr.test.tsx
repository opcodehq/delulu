// @vitest-environment node

import { createApiClient, createResourceEffects } from "@delulu/client";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppStateProvider,
  ResourceBoundary,
  useResourceAtom,
} from "./resources";

describe("AppStateProvider SSR", () => {
  it("does not start authenticated queries", async () => {
    const getToken = vi.fn(() => {
      throw new Error("getToken must not run during SSR");
    });
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      getToken,
    });
    const resources = createResourceEffects({ client });
    const errors: unknown[] = [];
    const Probe = () => {
      const workspaces = useResourceAtom(resources.me.workspaces());
      return <div>{workspaces.data?.data.length ?? 0}</div>;
    };

    const stream = await renderToReadableStream(
      <AppStateProvider client={client}>
        <ResourceBoundary fallback={<div>loading</div>}>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>,
      {
        onError: (error) => {
          errors.push(error);
        },
      }
    );
    const html = await new Response(stream).text();

    expect(errors).toEqual([]);
    expect(getToken).not.toHaveBeenCalled();
    expect(html).toContain("0");
  });
});
