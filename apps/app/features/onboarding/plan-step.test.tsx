import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanStep } from "@/features/onboarding/plan-step";

const PAYMENT_SYNCING = /payment confirmed, syncing/i;
const START_CHECKOUT = /start checkout/i;
const CONNECTED_ACCOUNTS = /connected accounts/i;

vi.mock("@/features/billing/pricing-cards", () => ({
  PricingCards: () => <button type="button">Start checkout</button>,
}));

afterEach(cleanup);

describe("PlanStep", () => {
  it("hides checkout while a successful payment is syncing", () => {
    render(
      <PlanStep
        accounts={[]}
        isRefreshing
        onDashboard={vi.fn()}
        onRefresh={vi.fn()}
        paid={false}
        plan="free"
        refreshError={null}
      />
    );

    expect(screen.getByText(PAYMENT_SYNCING)).toBeTruthy();
    expect(screen.queryByRole("button", { name: START_CHECKOUT })).toBeNull();
  });

  it("summarizes every connected account before checkout", () => {
    render(
      <PlanStep
        accounts={[
          {
            id: "connection_instagram",
            platform: "INSTAGRAM",
            profileId: "profile_instagram",
            username: "creator",
            displayName: "Creator account",
            profileImage: "https://images.example.test/creator.jpg",
            expiresAt: null,
          },
          {
            id: "connection_threads",
            platform: "THREADS",
            profileId: "profile_threads",
            username: "studio",
            displayName: "Studio account",
            profileImage: null,
            expiresAt: null,
          },
        ]}
        isRefreshing={false}
        onDashboard={vi.fn()}
        onRefresh={vi.fn()}
        paid={false}
        plan="Selected plan"
        refreshError={null}
      />
    );

    expect(
      screen.getByRole("heading", { name: CONNECTED_ACCOUNTS })
    ).toBeTruthy();
    expect(screen.getByText("Creator account")).toBeTruthy();
    expect(screen.getByText("Studio account")).toBeTruthy();
    expect(screen.getByRole("button", { name: START_CHECKOUT })).toBeTruthy();
  });
});
