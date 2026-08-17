// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { LotterySwitcher, type LotteryId } from "../Prototype";

function SwitcherHarness() {
  const [selected, setSelected] = useState<LotteryId>("今彩539");
  return <LotterySwitcher selected={selected} onChange={setSelected} className="home-switcher-box" />;
}

describe("homepage lottery switcher interaction", () => {
  it("keeps exactly one selected lottery while switching all four hit areas", () => {
    render(<SwitcherHarness />);

    const labels: LotteryId[] = ["今彩539", "天天樂", "六合彩", "大樂透"];
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);

    for (const label of labels) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      const selected = screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true");
      expect(selected).toHaveLength(1);
      expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByTestId("lottery-switcher")).toHaveAttribute("data-selected-lottery", label);
    }
  });
});
