import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStepper } from "@/features/onboarding/onboarding-stepper";

const PUBLISH_CONTENT = /publish content/i;
const CONTINUE = /^continue/i;
const PUBLISH_FIRST = /connect your social accounts/i;
const CREATE_POST = /create your first post/i;
const CREATE_AUTO_DM = /create your first auto-dm/i;
const REVIEW_PLANS = /review plans/i;
const CHOOSE_PLAN = /choose a plan to continue/i;
const LOG_OUT = /log out/i;
const CHOOSE_FIRST_GOAL = /what do you want to do first/i;
const CHOOSE_YOUR_PLAN = /choose your plan/i;
const PLAN_STILL_SYNCING = /plan activation is still syncing/i;
const CHECKOUT_CANCELLED = /checkout was cancelled/i;
const MOVE_ACCOUNT = /move account/i;
const SKIP_FOR_NOW = /skip for now/i;
const MORE_NETWORKS = /more networks/i;
const PINTEREST = /pinterest/i;
const BLUESKY = /bluesky/i;
const CONNECT_INSTAGRAM = /instagram connect/i;
const CONNECT_THREADS = /threads connect/i;
const ADD_ANOTHER_THREADS = /threads add another/i;
const READY_TO_PUBLISH = /you’re ready to start publishing/i;
const PLAN_INCLUDES = /plan includes/i;
const UPGRADE = /upgrade/i;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  setupRefetch: vi.fn(),
  search: "",
  toastError: vi.fn(),
  updateSetup: vi.fn(),
  completeSetup: vi.fn(),
  confirmTransfer: vi.fn(),
  setupData: {
    goal: null as "publish" | "auto_dm" | null,
    webStep: "goal",
    subscription: { plan: "free", status: "inactive", paid: false },
  },
  accountsData: [] as Array<{
    id: string;
    platform: string;
    profileId: string;
    username: string | null;
    displayName: string | null;
    profileImage: string | null;
    expiresAt: string | null;
  }>,
}));

vi.mock("@delulu/auth", () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
  useSession: () => ({
    session: {
      clearCache: vi.fn(),
      getToken: vi.fn(),
      reload: vi.fn(),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({
    resources: {
      me: {
        setup: () => ({ queryKey: ["setup"], effect: vi.fn() }),
        updateSetup: () => ({
          mutationKey: ["updateSetup"],
          effect: vi.fn(),
        }),
        completeSetup: () => ({
          mutationKey: ["completeSetup"],
          effect: vi.fn(),
        }),
      },
      connections: {
        confirmTransfer: () => ({
          mutationKey: ["confirmTransfer"],
          effect: vi.fn(),
        }),
        list: () => ({ queryKey: ["connections"], effect: vi.fn() }),
        mint: () => ({ mutationKey: ["mint"], effect: vi.fn() }),
        remove: () => ({ mutationKey: ["remove"], effect: vi.fn() }),
      },
    },
  }),
}));

vi.mock("@/shell/providers/workspace", () => ({
  useWorkspace: () => ({ workspaceId: "workspace_test" }),
}));

vi.mock("@/shell/use-feature-flag", () => ({
  useFeatureFlag: () => true,
}));

vi.mock("@/features/onboarding/plan-step", () => ({
  PlanStep: ({
    accounts,
    isRefreshing,
    paid,
    refreshError,
  }: {
    accounts: Array<{ displayName: string | null; username: string | null }>;
    isRefreshing: boolean;
    paid: boolean;
    refreshError: string | null;
  }) => (
    <div>
      <span>
        {paid
          ? "Plan active"
          : isRefreshing
            ? "Payment confirmed, syncing"
            : "Choose your plan"}
      </span>
      {refreshError ? <span>{refreshError}</span> : null}
      {accounts.map((account) => (
        <span key={account.username}>
          {account.displayName ?? account.username}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("@/shell/state/resources", () => ({
  useResourceAtom: (options: { queryKey: string[] }) =>
    options.queryKey[0] === "setup"
      ? {
          data: mocks.setupData,
          refetch: mocks.setupRefetch,
        }
      : {
          data: { data: mocks.accountsData, total: mocks.accountsData.length },
          refetch: vi
            .fn()
            .mockResolvedValue({ data: { data: mocks.accountsData } }),
        },
  useMutationAtom: (options: { mutationKey: string[] }) => {
    const key = options.mutationKey[0];
    return {
      isPending: false,
      mutateAsync:
        key === "updateSetup"
          ? mocks.updateSetup
          : key === "completeSetup"
            ? mocks.completeSetup
            : key === "confirmTransfer"
              ? mocks.confirmTransfer
              : vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OnboardingStepper", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.setupRefetch.mockReset();
    mocks.setupRefetch.mockImplementation(async () => ({
      data: mocks.setupData,
    }));
    mocks.toastError.mockReset();
    mocks.search = "";
    mocks.updateSetup.mockReset();
    mocks.updateSetup.mockResolvedValue({ updated: true });
    mocks.completeSetup.mockReset();
    mocks.completeSetup.mockResolvedValue({ completed: true });
    mocks.confirmTransfer.mockReset();
    mocks.confirmTransfer.mockResolvedValue({ confirmed: true });
    mocks.setupData.goal = null;
    mocks.setupData.webStep = "goal";
    mocks.setupData.subscription = {
      plan: "free",
      status: "inactive",
      paid: false,
    };
    mocks.accountsData = [];
  });

  it("lets the user sign out from every onboarding step", async () => {
    let view = render(<OnboardingStepper />);

    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));

    await waitFor(() =>
      expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in" })
    );
    view.unmount();

    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";
    view = render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(2));
    view.unmount();

    mocks.setupData.webStep = "ready";
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];
    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(3));

    cleanup();
    mocks.setupData.webStep = "plan";
    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(4));
  });

  it("recovers when logout fails", async () => {
    mocks.signOut.mockRejectedValueOnce(
      new Error("Session service unavailable")
    );
    render(<OnboardingStepper />);

    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: LOG_OUT }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    expect(mocks.toastError).toHaveBeenCalledWith("Could not log out", {
      description: "Session service unavailable",
    });
  });

  it("blocks onboarding interactions while logout is pending", async () => {
    let finishSignOut: (() => void) | undefined;
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSignOut = resolve;
        })
    );
    render(<OnboardingStepper />);

    fireEvent.click(screen.getByRole("button", { name: LOG_OUT }));

    await waitFor(() => {
      const logout = screen.getByRole("button", {
        name: LOG_OUT,
      }) as HTMLButtonElement;
      expect(logout.disabled).toBe(true);
      expect(
        screen
          .getByRole("region", { name: "Onboarding step" })
          .hasAttribute("inert")
      ).toBe(true);
    });

    finishSignOut?.();
  });

  it("saves the selected activation goal and advances to connections", async () => {
    render(<OnboardingStepper />);

    fireEvent.click(screen.getByRole("radio", { name: PUBLISH_CONTENT }));

    await waitFor(() =>
      expect(mocks.updateSetup).toHaveBeenCalledWith({ goal: "publish" })
    );
    fireEvent.click(screen.getByRole("button", { name: CONTINUE }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: PUBLISH_FIRST,
        })
      ).toBeTruthy()
    );
  });

  it("accepts a non-Instagram publishing account and requires a plan", async () => {
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "ready";
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);
    mocks.setupData.webStep = "plan";
    fireEvent.click(screen.getByRole("button", { name: REVIEW_PLANS }));

    await waitFor(() =>
      expect(mocks.updateSetup).toHaveBeenCalledWith({
        optionalSteps: { ready: "completed" },
      })
    );
    expect(screen.getByText("Choose your plan")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: CHOOSE_PLAN }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(mocks.completeSetup).not.toHaveBeenCalled();
  });

  it("keeps every connection action available before plan selection", () => {
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);

    expect(
      (
        screen.getByRole("button", {
          name: ADD_ANOTHER_THREADS,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: CONNECT_INSTAGRAM,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(screen.queryByText(PLAN_INCLUDES)).toBeNull();
    expect(screen.queryByText(UPGRADE)).toBeNull();
  });

  it("lets the user skip connections without making the plan skippable", async () => {
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";
    mocks.updateSetup.mockImplementationOnce(async () => {
      mocks.setupData.webStep = "plan";
      return { updated: true };
    });

    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: SKIP_FOR_NOW }));

    await waitFor(() =>
      expect(mocks.updateSetup).toHaveBeenCalledWith({
        optionalSteps: {
          connect: "skipped",
          ready: "skipped",
        },
      })
    );
    expect(await screen.findByText("Choose your plan")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: CHOOSE_PLAN }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("shows direct supported networks and excludes unavailable networks", () => {
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";

    render(<OnboardingStepper />);

    expect(screen.queryByText(MORE_NETWORKS)).toBeNull();
    expect(screen.queryByText(PINTEREST)).toBeNull();
    expect(screen.queryByText(BLUESKY)).toBeNull();
    expect(
      screen.getByRole("button", { name: CONNECT_INSTAGRAM })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: CONNECT_THREADS })).toBeTruthy();
  });

  it("shows connected accounts again on the plan step", () => {
    mocks.search = "step=plan";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "plan";
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);

    expect(screen.getByText("Creator")).toBeTruthy();
  });

  it("shows connected identity and keeps the platform available for another account", () => {
    mocks.search = "step=connect";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "ready";
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: "https://images.example.test/creator.jpg",
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);

    expect(screen.getByText("@creator")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: ADD_ANOTHER_THREADS })
    ).toBeTruthy();
  });

  it("uses the OAuth transfer grant without source workspace membership", async () => {
    mocks.search =
      "notification=transfer_required&platform=instagram&connectionId=connection_existing&sourceWorkspaceId=workspace_other&transferToken=signed-transfer-grant&step=connect";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";

    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: MOVE_ACCOUNT }));

    await waitFor(() =>
      expect(mocks.confirmTransfer).toHaveBeenCalledWith({
        sourceWorkspaceId: "workspace_other",
        transferToken: "signed-transfer-grant",
      })
    );
  });

  it("leaves the callback connection step as soon as setup reaches ready", async () => {
    mocks.search =
      "success=true&provider=threads&step=connect#username=creator";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "connect";
    mocks.setupRefetch.mockImplementation(async () => {
      mocks.setupData.webStep = "ready";
      mocks.accountsData = [
        {
          id: "connection_threads",
          platform: "THREADS",
          profileId: "profile_threads",
          username: "creator",
          displayName: "Creator",
          profileImage: null,
          expiresAt: null,
        },
      ];
      return { data: mocks.setupData };
    });

    render(<OnboardingStepper />);

    expect(
      await screen.findByRole("heading", {
        name: READY_TO_PUBLISH,
      })
    ).toBeTruthy();
  });

  it("ignores a direct plan URL before the server reaches that step", () => {
    mocks.search = "step=plan";

    render(<OnboardingStepper />);

    expect(
      screen.getByRole("heading", {
        name: CHOOSE_FIRST_GOAL,
      })
    ).toBeTruthy();
    expect(screen.queryByText(CHOOSE_YOUR_PLAN)).toBeNull();
  });

  it("reconciles a successful payment callback and cleans its URL", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    mocks.search = "step=plan&status=succeeded";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "plan";
    mocks.setupRefetch.mockImplementationOnce(async () => {
      mocks.setupData.subscription = {
        plan: "ECHO",
        status: "active",
        paid: true,
      };
      return { data: mocks.setupData };
    });

    render(<OnboardingStepper />);

    await waitFor(() => expect(screen.getByText("Plan active")).toBeTruthy());
    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/onboarding"
    );
  });

  it("bounds payment reconciliation retries and offers recovery", async () => {
    vi.useFakeTimers();
    mocks.search = "step=plan&status=succeeded";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "plan";

    render(<OnboardingStepper />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.setupRefetch).toHaveBeenCalledTimes(5);
    expect(screen.getByText(PLAN_STILL_SYNCING)).toBeTruthy();
  });

  it("keeps checkout available after a cancelled payment callback", async () => {
    mocks.search = "step=plan&cancelled=true";
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "plan";

    render(<OnboardingStepper />);

    await waitFor(() =>
      expect(screen.getByText(CHECKOUT_CANCELLED)).toBeTruthy()
    );
    expect(screen.getByText("Choose your plan")).toBeTruthy();
  });

  it("opens the composer only after a paid plan is active", async () => {
    mocks.setupData.goal = "publish";
    mocks.setupData.webStep = "plan";
    mocks.setupData.subscription = {
      plan: "ECHO",
      status: "active",
      paid: true,
    };
    mocks.accountsData = [
      {
        id: "connection_threads",
        platform: "THREADS",
        profileId: "profile_threads",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: CREATE_POST }));

    await waitFor(() => expect(mocks.completeSetup).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith("/post");
  });

  it("requires Instagram and a paid plan before opening the starter automation", async () => {
    mocks.setupData.goal = "auto_dm";
    mocks.setupData.webStep = "plan";
    mocks.setupData.subscription = {
      plan: "VIBE",
      status: "active",
      paid: true,
    };
    mocks.accountsData = [
      {
        id: "connection_instagram",
        platform: "INSTAGRAM",
        profileId: "profile_instagram",
        username: "creator",
        displayName: "Creator",
        profileImage: null,
        expiresAt: null,
      },
    ];

    render(<OnboardingStepper />);
    fireEvent.click(screen.getByRole("button", { name: CREATE_AUTO_DM }));

    await waitFor(() => expect(mocks.completeSetup).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith(
      "/automations/new?template=lead-magnet"
    );
  });
});
