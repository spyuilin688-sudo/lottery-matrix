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

  it.each(["merchant-info", "problem-report", "business-cooperation"] as const)(
    "does not show a phone number or dialing link on %s",
    (contactScreen) => {
      render(<FeaturePageRouter screen={contactScreen} onNavigate={() => undefined} />);

      expect(screen.queryByText("電話：")).toBeNull();
      expect(screen.queryByText("(02) 2686-1828")).toBeNull();
      expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    },
  );
});
