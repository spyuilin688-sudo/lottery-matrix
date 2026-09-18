// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturePageRouter } from "./FeaturePagesPatched";
import { RefundPolicyPage } from "./features/MemberPages";

describe("contact support details", () => {
  it.each(["merchant-info", "problem-report", "business-cooperation"] as const)(
    "shows the current support email and phone on %s",
    async (contactScreen) => {
      render(<FeaturePageRouter screen={contactScreen} onNavigate={() => undefined} />);

      const support = (await screen.findByRole("heading", { name: "聯絡客服" })).closest("section")!;
      const emails = screen.getAllByRole("link", { name: "matrix.lottery@gmail.com" });
      expect(emails).toHaveLength(3);
      emails.forEach((email) => expect(email).toHaveAttribute("href", "mailto:matrix.lottery@gmail.com"));
      expect(within(support).getByRole("link", { name: "0912-403-517" })).toHaveAttribute("href", "tel:0912403517");
      expect(document.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);
      expect(screen.queryByText("(02) 2686-1828")).not.toBeInTheDocument();
    },
  );

  it("uses the current contact email for refund requests", () => {
    render(<RefundPolicyPage onNavigate={() => undefined} />);

    expect(screen.getByRole("link", { name: "matrix.lottery@gmail.com" })).toHaveAttribute("href", "mailto:matrix.lottery@gmail.com");
  });
});
