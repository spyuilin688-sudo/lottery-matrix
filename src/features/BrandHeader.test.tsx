// @vitest-environment jsdom
import { assert, test } from "vitest";
import { createElement, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandHeader } from "./BrandHeader";

test("all title variants render the official logo, complete title, subtitle and requested back state", () => {
  for (const [title, back, subtitle] of [
    ["Matrix 探索", true, "EXPLORE"], ["Matrix 天衡", true, "TIANHENG"],
    ["Matrix 天衍", true, "TIANYAN"], ["Matrix 天工", true, "TIANGONG"],
    ["歷史開獎號碼", true, "DRAW HISTORY"], ["Matrix 同星", true, "TONGXING"],
    ["號碼對照單", true, "NUMBER REFERENCE"], ["通知", false, "NOTIFICATIONS"],
    ["我的", false, "MY ACCOUNT"], ["記事", false, "NOTES"],
    ["Matrix 筆記本", true, "NOTEBOOK"], ["隱私權政策", true, "PRIVACY POLICY"],
    ["Matrix Pro 訂閱方案與收費標準", true, "MATRIX PRO"],
    ["聯絡客服/問題回報/商務合作", true, "CONTACT & SUPPORT"],
  ] as const) {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(BrandHeader, { title, onBack() {}, showBack: back })), "text/html");
    assert.equal(doc.querySelector('h1')!.textContent, title.replace(/^Matrix\b/, "MATRIX"));
    assert.equal(doc.querySelector('.product-header__copy > span')!.textContent, subtitle);
    assert.equal(doc.querySelector('.product-header__mark')!.getAttribute('src'), '/assets/lottery/matrixYY.png');
    assert.equal(doc.querySelectorAll('[aria-label="返回"]').length, back ? 1 : 0, title);
    assert.equal(doc.querySelector('[style]'), null);
    assert.equal(doc.querySelector('.integrated-title-header'), null);
  }
});

test("header keeps back callbacks, title actions and link navigation operational", async () => {
  document.body.innerHTML = '<div id="root"></div>';
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  let backs = 0;
  let actions = 0;
  await act(async () => root.render(createElement(BrandHeader, {
    title: '歷史開獎號碼', onBack: () => backs++,
    action: createElement('button', { onClick: () => actions++ }, '篩選設定'),
  })));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="返回"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('.product-header__actions button')!.click());
  assert.equal(backs, 1);
  assert.equal(actions, 1);
  await act(async () => root.render(createElement(BrandHeader, { title: 'Matrix 探索', backHref: '/' })));
  assert.equal(document.querySelector('a[aria-label="返回"]')!.getAttribute('href'), '/');
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

