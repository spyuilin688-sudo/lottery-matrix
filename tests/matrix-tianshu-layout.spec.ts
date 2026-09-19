import { expect, test, type Page } from '@playwright/test';
import { prepareLineMember, prepareReturningVisitor } from './helpers/product-runtime';

const item = {
  id: 'ts-layout-1', firstNumber: '05', firstLockedPosition: 1,
  secondNumber: '18', secondLockedPosition: 3,
  thirdNumber: '31', thirdLockedPosition: 5,
  predictionDistance: 5, consecutive: '準5進6', highestStreak: 5,
  predictionNumbers: ['19'], algorithmType: '拖牌',
  numberOrder: '依號碼由小到大排序', explorePeriods: 3,
  exploreDateOffset: 0, ruleCount: 2, referenceOffset: 0, referencePosition: 1,
};

const tianhengItem = {
  id: 'th-layout-1', firstNumber: '05', firstLockedPosition: 1,
  secondNumber: '18', secondLockedPosition: 3,
  predictionDistance: 5, consecutive: '準5進6', highestStreak: 5,
  predictionNumbers: ['19'], algorithmType: '拖牌',
  numberOrder: '依號碼由小到大排序', explorePeriods: 3,
  exploreDateOffset: 0, ruleCount: 2, referenceOffset: 0, referencePosition: 1,
};

const validation = {
  itemId: item.id,
  sourceA: {
    sourcePeriod: '114001', sourceNumbers: ['05', '10', '18', '24', '31'],
    sourceSortedNumbers: ['05', '10', '18', '24', '31'],
    sourceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
    lockedPositions: [1, 3, 5], lockedNumbers: [5, 18, 31],
    referencePeriod: '114001', referenceNumbers: ['05', '10', '18', '24', '31'],
    referenceSortedNumbers: ['05', '10', '18', '24', '31'],
    referenceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
    baseNumber: 5, predictionPeriod: null, predictionCompleted: false,
  },
  ruleSets: [{
    rules: [
      { value: 14, display: '+14', algorithmType: '拖牌' },
      { value: 24, display: '+24', algorithmType: '拖牌' },
    ],
    predictionNumbers: [19],
    historicalValidation: [{
      group: 'B', sourcePeriod: '113990',
      sourceNumbers: ['05', '10', '18', '24', '31'],
      sourceSortedNumbers: ['05', '10', '18', '24', '31'],
      sourceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
      lockedPositions: [1, 3, 5], lockedNumbers: [5, 18, 31],
      referencePeriod: '113990', referenceNumbers: ['05', '10', '18', '24', '31'],
      referenceSortedNumbers: ['05', '10', '18', '24', '31'],
      referenceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
      baseNumber: 5, predictionPeriod: '113985',
      predictionNumbers: ['01', '09', '19', '23', '30'],
      candidateRules: [14, 24], matchedRules: [
        { value: 14, display: '+14', algorithmType: '拖牌' },
        { value: 24, display: '+24', algorithmType: '拖牌' },
      ],
      hitNumbers: [19], success: true,
    }],
  }],
};

function layoutData(lottery: string) {
  const wide = lottery === '六合彩' || lottery === '大樂透';
  const sourceNumbers = wide ? ['05', '10', '18', '24', '31', '40', '49'] : ['05', '10', '18', '24', '31'];
  const drawNumbers = wide ? ['24', '05', '31', '10', '18', '40', '49'] : ['24', '05', '31', '10', '18'];
  const triple = { ...item, thirdNumber: wide ? '49' : '31', thirdLockedPosition: wide ? 7 : 5 };
  const sourcePeriod = lottery === '六合彩' ? '2026100' : '114001';
  const historyPeriod = lottery === '六合彩' ? '2026090' : '113990';
  const lockedPositions = wide ? [1, 3, 7] : [1, 3, 5];
  const lockedNumbers = wide ? [5, 18, 49] : [5, 18, 31];
  const numberFields = {
    sourceNumbers, sourceSortedNumbers: sourceNumbers, sourceDrawOrderNumbers: drawNumbers,
    referenceNumbers: sourceNumbers, referenceSortedNumbers: sourceNumbers, referenceDrawOrderNumbers: drawNumbers,
    lockedPositions, lockedNumbers,
  };
  const tripleValidation = {
    ...validation,
    sourceA: { ...validation.sourceA, ...numberFields, sourcePeriod, referencePeriod: sourcePeriod },
    ruleSets: validation.ruleSets.map(ruleSet => ({
      ...ruleSet,
      historicalValidation: ruleSet.historicalValidation.map(row => ({
        ...row, ...numberFields, sourcePeriod: historyPeriod, referencePeriod: historyPeriod,
        predictionNumbers: wide ? ['01', '09', '19', '23', '30', '38', '48'] : row.predictionNumbers,
      })),
    })),
  };
  const pairValidation = {
    ...tripleValidation, itemId: tianhengItem.id,
    sourceA: { ...tripleValidation.sourceA, lockedPositions: [1, 3], lockedNumbers: [5, 18] },
    ruleSets: tripleValidation.ruleSets.map(ruleSet => ({
      ...ruleSet,
      historicalValidation: ruleSet.historicalValidation.map(row => ({
        ...row, lockedPositions: [1, 3], lockedNumbers: [5, 18],
      })),
    })),
  };
  return { triple, tripleValidation, pairValidation, sourceNumbers, wide };
}

async function isolateRuntime(page: Page, lottery = '今彩539') {
  const data = layoutData(lottery);
  // Registered first as a final safety net. No external HTTP(S) request may leave this browser.
  await page.route(/^https?:\/\//, async route => {
    const host = new URL(route.request().url()).hostname;
    if (host === '127.0.0.1' || host === 'localhost') return route.continue();
    return route.fulfill({ status: 503, json: { error: 'tianshu_layout_external_request_blocked' } });
  });
  await prepareReturningVisitor(page);
  await prepareLineMember(page);
  // Registered last so deterministic fixture RPCs take precedence over the helper's backend block.
  await page.route('https://*.supabase.co/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const responses: Record<string, unknown> = {
      matrix_permission_settings: {
        subscriptionPurchaseVisible: false, registeredMemberFreeAccess: true,
        revision: 1, updatedAt: '2026-09-19T00:00:00.000Z',
      },
      member_bootstrap: { memberId: 'layout-member', lineUserId: 'runtime-line' },
      member_profile: {
        memberId: 'layout-member', lineUserId: 'runtime-line', planName: 'Matrix Pro',
        planExpiresAt: null, isLifetime: true,
        exploreEntitlements: { canUseSeven: true, canUseThirteen: true, canUseFullRange: true },
      },
      matrix_tianshu_list: {
        lottery, draw_period: '114001', analysis_version: '114001:layout-v1',
        items: [data.triple], duplicate_stats: [{ number: '19', count: 1 }], total: 1,
      },
      matrix_tianshu_validation: {
        lottery, draw_period: '114001', analysis_version: '114001:layout-v1',
        item_id: item.id, validation: data.tripleValidation,
      },
      matrix_tianheng_list: {
        lottery, draw_period: '114001', analysis_version: '114001:layout-v1',
        items: [tianhengItem], duplicate_stats: [{ number: '19', count: 1 }], total: 1,
      },
      matrix_tianheng_validation: {
        lottery, draw_period: '114001', analysis_version: '114001:layout-v1',
        item_id: tianhengItem.id, validation: data.pairValidation,
      },
      member_online_start: {}, member_online_end: {},
    };
    if (!(name! in responses)) return route.fulfill({ status: 503, json: { error: `unexpected_fixture_rpc:${name}` } });
    return route.fulfill({ status: 200, json: responses[name!] });
  });
}

for (const width of [320, 390]) {
  for (const lottery of ['今彩539', '六合彩', '大樂透']) {
    test(`locked validation numbers remain readable for ${lottery} at ${width}px`, async ({ page }, testInfo) => {
      await isolateRuntime(page, lottery);
      await page.setViewportSize({ width, height: 1200 });
      await page.goto('/tests/matrix-tianshu-layout-fixture.html');
      await expect(page.getByRole('heading', { name: 'MATRIX 天樞', exact: true })).toBeVisible();
      const expected = layoutData(lottery);
      for (const algorithm of [{ id: 'tianshu', name: '天樞', itemId: item.id, locks: 3 }, { id: 'tianheng', name: '天衡', itemId: tianhengItem.id, locks: 2 }]) {
        if (algorithm.id === 'tianheng') await page.getByRole('button', { name: 'Matrix 天衡', exact: true }).click();
        await page.getByRole('tab', { name: lottery, exact: true }).click();
        await page.getByRole('button', { name: `開始${algorithm.name}`, exact: true }).click();
        await page.getByRole('button', { name: `展開版路 ${algorithm.itemId}`, exact: true }).click();
        const region = page.getByRole('region', { name: `${algorithm.name}驗證過程` });
        await expect(region).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
        const source = page.getByTestId(`${algorithm.id}-source-row-B`);
        await expect(source.locator('.explore-validation-number')).toHaveText(expected.sourceNumbers);
        await expect(source.locator('.explore-validation-number--hit')).toHaveCount(algorithm.locks);
        const metrics = await region.locator('.explore-validation-number-row').evaluateAll(rows => rows
          .filter(row => row.querySelector('.explore-validation-number'))
          .map(row => {
          const card = row.closest<HTMLElement>('.explore-validation-numbers-card')!;
          const numbers = row.querySelector<HTMLElement>('.explore-validation-numbers')!;
          const cardBounds = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          const left = cardBounds.left + parseFloat(style.borderLeftWidth);
          const right = cardBounds.right - parseFloat(style.borderRightWidth);
          const children = [...numbers.querySelectorAll<HTMLElement>('.explore-validation-number, .explore-validation-special-separator')];
          return {
            cardWidth: cardBounds.width, cardHeight: cardBounds.height,
            rowHeight: row.getBoundingClientRect().height,
            fontSizes: children.filter(child => child.classList.contains('explore-validation-number')).map(child => getComputedStyle(child).fontSize),
            bounds: children.map(child => {
              const box = child.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(child);
              const text = range.getBoundingClientRect();
              return { text: child.textContent, left: Math.min(box.left, text.left), right: Math.max(box.right, text.right) };
            }),
            left, right,
          };
        }));
        console.log(`number containment ${algorithm.id} ${lottery} ${width}: ${JSON.stringify(metrics)}`);
        await region.screenshot({ path: testInfo.outputPath(`${algorithm.id}-${lottery}-${width}.png`), animations: 'disabled' });
        expect(metrics).toHaveLength(3);
        if (lottery === '今彩539') {
          // Recorded before the spacing repair: changing gaps must not resize cards.
          expect(metrics.map(row => [row.cardWidth, row.cardHeight, row.rowHeight])).toEqual(width === 320
            ? [[97.234375, 83, 27], [97.234375, 83, 27], [97.234375, 56, 27]]
            : [[167.234375, 86, 28], [167.234375, 86, 28], [167.234375, 58, 28]]);
        }
        for (const row of metrics) {
          expect(row.fontSizes).toEqual(Array(expected.wide ? 7 : 5).fill(expected.wide ? '12px' : '13px'));
          for (const [index, number] of row.bounds.entries()) {
            expect.soft(number.left, `${algorithm.name} ${lottery} ${number.text} left edge`).toBeGreaterThanOrEqual(row.left - 0.01);
            expect.soft(number.right, `${algorithm.name} ${lottery} ${number.text} right edge`).toBeLessThanOrEqual(row.right + 0.01);
            if (index > 0) expect.soft(number.left, `${algorithm.name} ${lottery} ${number.text} does not overlap`).toBeGreaterThanOrEqual(row.bounds[index - 1].right - 0.01);
          }
        }
      }
    });
  }
}

function geometry(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.explore-settings')!;
    const grid = panel.querySelector<HTMLElement>('.setting-grid')!;
    const segmented = [...panel.querySelectorAll<HTMLElement>('.segmented')];
    const condition = panel.querySelector<HTMLElement>('.hit-options')!;
    return {
      panel: [panel.getBoundingClientRect().width, panel.getBoundingClientRect().height],
      rowGap: getComputedStyle(grid).rowGap,
      segmented: segmented.map(node => [node.getBoundingClientRect().width, node.getBoundingClientRect().height]),
      condition: [condition.getBoundingClientRect().width, condition.getBoundingClientRect().height],
    };
  });
}

function switcherGeometry(page: Page) {
  return page.getByRole('navigation', { name: 'Matrix Core 功能切換' }).evaluate(node => {
    const switcher = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const buttons = [...node.querySelectorAll<HTMLButtonElement>('button')].map(button => {
      const bounds = button.getBoundingClientRect();
      const buttonStyle = getComputedStyle(button);
      return {
        left: bounds.left - switcher.left,
        width: bounds.width,
        contentWidth: bounds.width
          - Number.parseFloat(buttonStyle.paddingLeft)
          - Number.parseFloat(buttonStyle.paddingRight)
          - Number.parseFloat(buttonStyle.borderLeftWidth)
          - Number.parseFloat(buttonStyle.borderRightWidth),
        borderRightWidth: buttonStyle.borderRightWidth,
      };
    });
    return {
      width: switcher.width,
      height: switcher.height,
      innerWidth: switcher.width
        - Number.parseFloat(style.borderLeftWidth)
        - Number.parseFloat(style.borderRightWidth),
      buttons,
    };
  });
}

function validationNumberRowGeometry(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate(row => {
    const card = row.closest<HTMLElement>('.explore-validation-numbers-card')!;
    const numbers = row.querySelector<HTMLElement>('.explore-validation-numbers')!;
    const numberNodes = [...numbers.querySelectorAll<HTMLElement>(':scope > .explore-validation-number')];
    const thirdLockNumber = numberNodes.at(-1)!;
    const firstHighlightedNumber = numberNodes.find(number => number.classList.contains('explore-validation-number--hit'))!;
    const rowBounds = row.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    const numbersBounds = numbers.getBoundingClientRect();
    const numberBox = (number: HTMLElement) => {
      const style = getComputedStyle(number);
      return {
        width: number.getBoundingClientRect().width,
        fontSize: style.fontSize,
        paddingInline: [style.paddingLeft, style.paddingRight],
        borderInline: [style.borderLeftWidth, style.borderRightWidth],
      };
    };
    return {
      cardWidth: cardBounds.width,
      rowWidth: rowBounds.width,
      numbersWidth: numbersBounds.width,
      cardOverflowX: card.scrollWidth - card.clientWidth,
      numbersOverflowX: numbers.scrollWidth - numbers.clientWidth,
      leftInset: numbersBounds.left - cardBounds.left,
      rightInset: cardBounds.right - numbersBounds.right,
      hitCount: numberNodes.filter(number => number.classList.contains('explore-validation-number--hit')).length,
      numberWidths: numberNodes.map(number => number.getBoundingClientRect().width),
      thirdLockNumber: {
        value: thirdLockNumber.textContent,
        highlighted: thirdLockNumber.classList.contains('explore-validation-number--hit'),
        ...numberBox(thirdLockNumber),
      },
      firstHighlightedNumberBox: numberBox(firstHighlightedNumber),
    };
  });
}

for (const width of [320, 390, 1100]) {
  test(`Matrix 天樞 reuses Tianheng geometry and fits three locks at ${width}px`, async ({ page }, testInfo) => {
    await isolateRuntime(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tests/matrix-tianshu-layout-fixture.html');
    await expect(page.getByRole('heading', { name: 'MATRIX 天樞', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');

    const header = page.locator('.product-header__frame');
    await expect(header).toHaveCSS('height', '68px');
    const switcher = page.getByRole('navigation', { name: 'Matrix Core 功能切換' });
    await expect(switcher).toHaveCSS('width', '176px');
    await expect(switcher).toHaveCSS('height', '26px');
    const switchButtons = switcher.getByRole('button');
    await expect(switchButtons).toHaveCount(5);
    await expect(switchButtons).toHaveText(['探索', '天衡', '天樞', '天衍', '天工']);
    const tianshuSwitcherGeometry = await switcherGeometry(page);
    const contentWidths = tianshuSwitcherGeometry.buttons.map(button => button.contentWidth);
    expect(Math.max(...contentWidths) - Math.min(...contentWidths)).toBeLessThanOrEqual(1 / 64);
    expect(tianshuSwitcherGeometry.buttons.map(button => button.borderRightWidth)).toEqual([
      '1px', '1px', '1px', '1px', '0px',
    ]);
    expect(tianshuSwitcherGeometry.buttons.reduce((total, button) => total + button.width, 0))
      .toBeCloseTo(tianshuSwitcherGeometry.innerWidth, 5);

    const tianshuGeometry = await geometry(page);
    await switcher.getByRole('button', { name: 'Matrix 天衡' }).click();
    await expect(page.getByRole('heading', { name: 'MATRIX 天衡', exact: true })).toBeVisible();
    expect(await geometry(page)).toEqual(tianshuGeometry);
    expect(await switcherGeometry(page)).toEqual(tianshuSwitcherGeometry);

    const tianshuButton = page.getByRole('button', { name: 'Matrix 天樞' });
    await tianshuButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'MATRIX 天樞', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Matrix 天樞' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: '開始天樞', exact: true }).click();
    const result = page.getByRole('button', { name: `展開版路 ${item.id}` });
    await expect(result).toBeVisible();
    await expect(result.locator('.tianheng-lock-positions > span')).toHaveCount(3);
    await expect(result.locator('.tianheng-lock-numbers > span')).toHaveText(['05', '18', '31']);
    const resultBounds = await result.evaluate(element => {
      const row = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>('.tianheng-lock-positions, .tianheng-lock-numbers')]
        .every(column => column.getBoundingClientRect().top >= row.top - 1 && column.getBoundingClientRect().bottom <= row.bottom + 1);
    });
    expect(resultBounds).toBe(true);

    await result.focus();
    await page.keyboard.press('Enter');
    const tianshuValidation = page.getByRole('region', { name: '天樞驗證過程' });
    await expect(tianshuValidation).toBeVisible();
    const rows = page.getByTestId('tianshu-summary-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator(':scope > span')).toHaveCount(3);
    const summaryMetrics = await page.locator('.explore-validation-summary-card').first().evaluate(card => {
      const summary = card.querySelector<HTMLElement>('.explore-validation-summary')!;
      const tag = card.querySelector<HTMLElement>('.explore-validation-consecutive-tag')!;
      const rows = [...summary.querySelectorAll<HTMLElement>('.tianyan-validation-summary-row')];
      const rangeBounds = rows.map(row => {
        const range = document.createRange();
        range.selectNodeContents(row);
        return range.getBoundingClientRect();
      });
      const summaryBounds = summary.getBoundingClientRect();
      const tagBounds = tag.getBoundingClientRect();
      return {
        firstRight: rangeBounds[0].right,
        firstLimit: tagBounds.left - 4,
        secondRight: rangeBounds[1].right,
        summaryRight: summaryBounds.right,
        summaryLeft: summaryBounds.left,
        rowsInside: rangeBounds.every(bounds => bounds.left >= summaryBounds.left - 1 && bounds.right <= summaryBounds.right + 1),
        fontSize: getComputedStyle(summary).fontSize,
      };
    });
    expect(summaryMetrics.firstRight).toBeLessThanOrEqual(summaryMetrics.firstLimit + 1);
    expect(summaryMetrics.secondRight).toBeLessThanOrEqual(summaryMetrics.summaryRight + 1);
    expect(summaryMetrics.rowsInside).toBe(true);
    expect(Number.parseFloat(summaryMetrics.fontSize)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.screenshot({ path: testInfo.outputPath(`tianshu-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width, height: 1200 });
    await tianshuValidation.scrollIntoViewIfNeeded();
    await tianshuValidation.screenshot({
      path: testInfo.outputPath(`tianshu-validation-${width}.png`), animations: 'disabled',
    });

    if (width === 320) {
      const tianshuNumberGeometry = await validationNumberRowGeometry(page, 'tianshu-source-row-B');
      await page.getByRole('button', { name: 'Matrix 天衡' }).click();
      await expect(page.getByRole('heading', { name: 'MATRIX 天衡', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '開始天衡', exact: true }).click();
      const tianhengResult = page.getByRole('button', { name: `展開版路 ${tianhengItem.id}` });
      await expect(tianhengResult).toBeVisible();
      await tianhengResult.click();
      const tianhengValidationRegion = page.getByRole('region', { name: '天衡驗證過程' });
      await expect(tianhengValidationRegion).toBeVisible();
      const tianhengNumberGeometry = await validationNumberRowGeometry(page, 'tianheng-source-row-B');
      const containerGeometry = (geometry: typeof tianshuNumberGeometry) => ({
        cardWidth: geometry.cardWidth,
        rowWidth: geometry.rowWidth,
        numbersWidth: geometry.numbersWidth,
        leftInset: geometry.leftInset,
        rightInset: geometry.rightInset,
      });
      const tianshuContainerGeometry = containerGeometry(tianshuNumberGeometry);
      const tianhengContainerGeometry = containerGeometry(tianhengNumberGeometry);
      expect(tianhengContainerGeometry).toEqual(tianshuContainerGeometry);
      expect(tianshuNumberGeometry.numberWidths.slice(0, -1))
        .toEqual(tianhengNumberGeometry.numberWidths.slice(0, -1));
      expect(tianshuNumberGeometry.hitCount).toBe(3);
      expect(tianhengNumberGeometry.hitCount).toBe(2);
      const { value: tianshuThirdValue, highlighted: tianshuThirdHighlighted, ...tianshuThirdNumberBox } = tianshuNumberGeometry.thirdLockNumber;
      const { value: tianhengThirdValue, highlighted: tianhengThirdHighlighted } = tianhengNumberGeometry.thirdLockNumber;
      expect([tianshuThirdValue, tianshuThirdHighlighted]).toEqual(['31', true]);
      expect([tianhengThirdValue, tianhengThirdHighlighted]).toEqual(['31', false]);
      expect(tianshuThirdNumberBox).toEqual(tianhengNumberGeometry.firstHighlightedNumberBox);
      console.log(`320px validation number geometry: ${JSON.stringify({ tianshu: tianshuNumberGeometry, tianheng: tianhengNumberGeometry })}`);
      await tianhengValidationRegion.scrollIntoViewIfNeeded();
      await tianhengValidationRegion.screenshot({
        path: testInfo.outputPath('tianheng-validation-320.png'), animations: 'disabled',
      });
    }
    console.log(`Matrix 天樞 ${width}px: header 68px; switcher 176x26; Tianheng geometry matched; three-lock result and two-row fitter passed`);
  });
}
