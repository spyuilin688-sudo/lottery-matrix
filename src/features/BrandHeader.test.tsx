// @vitest-environment jsdom
import { assert, test } from "vitest";
import { createElement, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandHeader } from "./BrandHeader";

test("all title variants render the official logo, complete title, subtitle and requested back state", () => {
  for (const [title, back, subtitle, background] of [
    ["Matrix 探索", true, "EXPLORE", "flow"], ["Matrix 天衡", true, "TIANHENG", "flow"],
    ["Matrix 天衍", true, "TIANYAN", "flow"], ["Matrix 天工", true, "TIANGONG", "flow"],
    ["歷史開獎號碼", true, "DRAW HISTORY", "geometric"], ["Matrix 同星", true, "TONGXING", "geometric"],
    ["號碼對照單", true, "NUMBER REFERENCE", "geometric"],
    ["Matrix 牌單", true, "DRAW SHEETS", "gold-arc"],
    ["Matrix 指南", true, "GUIDE", "gold-arc"], ["Matrix 狀態", true, "STATUS", "gold-arc"],
    ["Matrix 自訂觸發狀態", true, "CUSTOM TRIGGERS", "gold-arc"],
    ["自訂觸發條件", true, "CUSTOM TRIGGERS", "gold-arc"],
    ["連碰計算機", true, "COMBINATIONS", "gold-arc"], ["立柱計算機", true, "COLUMNS", "gold-arc"],
    ["通知設定", false, "NOTIFICATION SETTINGS", "gold-arc"], ["我的", false, "MY ACCOUNT", "gold-arc"],
    ["記事", false, "NOTES", "gold-arc"], ["記事詳細", true, "NOTE DETAILS", "gold-arc"],
    ["Matrix 筆記本", true, "NOTEBOOK", "gold-arc"], ["隱私權政策", true, "PRIVACY POLICY", "gold-arc"],
    ["管理訂閱", true, "SUBSCRIPTION", "gold-arc"], ["付款紀錄", true, "PAYMENT HISTORY", "gold-arc"],
    ["訂閱方案與收費標準", true, "MATRIX PRO", "gold-arc"],
    ["銀行轉帳付款", true, "BANK TRANSFER", "gold-arc"], ["關於 樂彩 Matrix", true, "ABOUT MATRIX", "gold-arc"],
    ["我的推薦碼/啟動碼", true, "REFERRAL & ACTIVATION", "gold-arc"],
    ["服務內容與使用說明", true, "SERVICE GUIDE", "gold-arc"], ["退款規範", true, "REFUND POLICY", "gold-arc"],
    ["聯絡客服/問題回報/商務合作", true, "CONTACT & SUPPORT", "gold-arc"],
    ["邀請好友", true, "INVITE FRIENDS", "gold-arc"], ["優惠活動", true, "PROMOTIONS", "gold-arc"],
    ["版本資訊/更新紀錄", true, "VERSION & UPDATES", "gold-arc"],
    ["會員服務條例", true, "MEMBER TERMS", "gold-arc"], ["聲明與免責事項", true, "DISCLAIMER", "gold-arc"],
    ["其他功能", true, "LOTTERY MATRIX", "gold-arc"],
  ] as const) {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(BrandHeader, { title, onBack() {}, showBack: back })), "text/html");
    assert.equal(doc.querySelector('header')!.getAttribute('data-header-style'), background, title);
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
