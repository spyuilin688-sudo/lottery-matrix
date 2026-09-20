import {test,expect} from '@playwright/test';
test('four-lottery evidence is readable at 320px and keyboard disclosures work',async({page})=>{
 await page.setViewportSize({width:320,height:720});
 await page.goto('/tests/matrix-watchdog.html');
 await expect(page.getByRole('article')).toHaveCount(4);
 await expect(page.getByText('已受理，等待資料驗證',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const summary=page.getByText('查看診斷證據',{exact:true}).first();
 await summary.focus();await page.keyboard.press('Enter');
 await expect(summary.locator('..')).toHaveAttribute('open','');
 await expect(page.getByText('CRON_UNAVAILABLE').first()).toBeVisible();
 await page.screenshot({path:'test-results/matrix-watchdog-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('empty and stale observations remain explicit',async({page})=>{
 await page.goto('/tests/matrix-watchdog.html?mode=empty');
 await expect(page.getByText('尚無完整資料鏈紀錄。')).toBeVisible();
 await page.goto('/tests/matrix-watchdog.html?mode=stale');
 await expect(page.getByText(/觀察已過期/)).toBeVisible();
 await expect(page.getByText('待重新確認',{exact:true})).toHaveCount(4);
});
