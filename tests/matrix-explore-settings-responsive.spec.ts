import { expect, test } from "@playwright/test";

for (const width of [360, 375, 390]) {
  test(`Matrix Explore setting controls render without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/matrix-explore-settings-responsive-fixture.html");

    const geometry = await page.evaluate(() => {
      const icon = document.querySelector<HTMLElement>(".matrix-explore-setting-icon");
      const settingGrid = document.querySelector<HTMLElement>(".setting-grid");
      const advancedRow = document.querySelector<HTMLElement>(".advanced-row");
      const advancedPanel = document.querySelector<HTMLElement>(".advanced-panel");
      const advancedTitles = Array.from(document.querySelectorAll<HTMLElement>(".advanced-panel .advanced-setting-title"));
      const advancedButtons = Array.from(document.querySelectorAll<HTMLElement>(".advanced-panel .segmented button"));
      const advancedDateButtons = Array.from(document.querySelectorAll<HTMLElement>(".advanced-date-options button"));
      const hitButtons = Array.from(document.querySelectorAll<HTMLElement>(".hit-options button"));
      const lockIcons = Array.from(document.querySelectorAll<SVGElement>(".segmented button em svg"));
      const nowrapControls = Array.from(document.querySelectorAll<HTMLElement>(
        ".setting-grid label > span, .advanced-panel .advanced-setting-title, .segmented button, .segmented button em",
      ));
      const overflowContainers = Array.from(document.querySelectorAll<HTMLElement>(
        ".explore-settings, .hit-advanced-panel, .setting-grid, .advanced-panel",
      ));
      if (!icon || !settingGrid || !advancedRow || !advancedPanel || hitButtons.length !== 2) throw new Error("Missing setting fixture controls");

      const iconStyle = getComputedStyle(icon);
      const hitStyles = hitButtons.map((button) => getComputedStyle(button));
      const screenFontFamily = getComputedStyle(document.querySelector<HTMLElement>(".matrix-explore-main-screen")!).fontFamily;
      return {
        advancedButtonCount: advancedButtons.length,
        advancedDateButtonCount: advancedDateButtons.length,
        advancedTitleCount: advancedTitles.length,
        iconWidth: Number.parseFloat(iconStyle.width),
        iconHeight: Number.parseFloat(iconStyle.height),
        rowGap: getComputedStyle(settingGrid).rowGap,
        advancedWeight: getComputedStyle(advancedRow).fontWeight,
        hitWidths: hitButtons.map((button) => button.getBoundingClientRect().width),
        hitHeights: hitStyles.map((style) => style.height),
        hitPadding: hitStyles.map((style) => style.padding),
        buttonsInheritTypography: Array.from(document.querySelectorAll<HTMLElement>(".segmented button"))
          .every((button) => getComputedStyle(button).fontFamily === screenFontFamily),
        lockIconCount: lockIcons.length,
        lockIconSizes: lockIcons.map((element) => {
          const style = getComputedStyle(element);
          return [style.width, style.height];
        }),
        nowrapControlCount: nowrapControls.length,
        nonNowrapControls: nowrapControls
          .filter((element) => getComputedStyle(element).whiteSpace !== "nowrap")
          .map((element) => element.textContent?.trim()),
        overflowingControls: nowrapControls
          .filter((element) => element.scrollWidth > element.clientWidth)
          .map((element) => element.textContent?.trim()),
        overflowingContainers: overflowContainers
          .filter((element) => element.scrollWidth > element.clientWidth)
          .map((element) => element.className),
        advancedRowOverflows: advancedRow.scrollWidth > advancedRow.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry.advancedTitleCount).toBe(3);
    expect(geometry.advancedButtonCount).toBe(5);
    expect(geometry.advancedDateButtonCount).toBe(3);
    expect(geometry.iconWidth).toBeCloseTo(28.8, 1);
    expect(geometry.iconHeight).toBeCloseTo(28.8, 1);
    expect(geometry.rowGap).toBe("7px");
    expect(geometry.advancedWeight).toBe("600");
    expect(geometry.hitWidths[0]).toBeCloseTo(geometry.hitWidths[1], 2);
    expect(geometry.hitHeights).toEqual(["28px", "28px"]);
    expect(geometry.hitPadding).toEqual(["2px 4px", "2px 4px"]);
    expect(geometry.buttonsInheritTypography).toBe(true);
    expect(geometry.lockIconCount).toBe(2);
    expect(geometry.lockIconSizes).toEqual([["6px", "6px"], ["6px", "6px"]]);
    expect(geometry.nowrapControlCount).toBe(22);
    expect(geometry.nonNowrapControls).toEqual([]);
    expect(geometry.overflowingControls).toEqual([]);
    expect(geometry.overflowingContainers).toEqual([]);
    expect(geometry.advancedRowOverflows).toBe(false);
    expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  });
}
