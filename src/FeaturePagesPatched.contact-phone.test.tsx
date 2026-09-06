// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./FeaturePagesCore", () => ({
  FeaturePageRouter: () => (
    <main className="contact-support-screen">
      <div className="feature-body">
        <section className="detail-card">
          <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>
        </section>
      </div>
    </main>
  ),
  QuickNavigationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./NotificationsPagePatched", () => ({
  NotificationsPagePatched: () => null,
}));

vi.mock("./TianyanExpandedLayoutPatch", () => ({
  TianyanExpandedLayoutPatch: () => null,
}));

import { FeaturePageRouter } from "./FeaturePagesPatched";

describe("contact support phone", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the phone label outside the tappable telephone link", () => {
    render(<FeaturePageRouter screen="merchant-info" onNavigate={() => undefined} />);

    const phoneLink = screen.getByRole("link", { name: "(02) 2686-1828" });
    expect(phoneLink.getAttribute("href")).toBe("tel:+886226861828");
    const label = screen.getByText("電話：");
    expect(label.closest("a")).toBeNull();
    expect(label.nextElementSibling).toBe(phoneLink);
  });
});
