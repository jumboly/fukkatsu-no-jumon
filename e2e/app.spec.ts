import { expect, test, type Page } from '@playwright/test';

// data-node は Overview と Pipeline の両方に同じ ID で現れるので、どちらを検査しているか明示する
const inPipeline = (page: Page, id: string) => page.locator(`.pipeline [data-node="${id}"]`);
const inOverview = (page: Page, id: string) => page.locator(`.overview [data-node="${id}"]`);
const passwordText = (page: Page) => page.locator('.password-panel .pw-cell').allTextContents().then((a) => a.join(''));
const fieldRow = (page: Page, label: string) =>
  page.locator('.field-row').filter({ has: page.locator('.field-label', { hasText: label }) });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.pipeline')).toBeVisible();
});

test('ゴーレム撃破を指すと byte5 bit1 → raw6[6] → 7 文字目が関連になる', async ({ page }) => {
  await fieldRow(page, 'ゴーレム撃破').locator('.state-cell').hover();
  for (const id of ['pbit:41', 'byte:5', 'rbit:6:5', 'raw:6', 'enc:6', 'char:6']) {
    await expect(inPipeline(page, id), id).toHaveClass(/\bis-related\b/);
  }
  // 無関係なフィールドは暗くなる
  await expect(inPipeline(page, 'field:exp')).toHaveClass(/\bis-dim\b/);
});

test('凡例を指すとそのカテゴリの bit だけが強調される', async ({ page }) => {
  await page.locator('.legend [data-node="cat:equip"]').hover();
  // 装備 = byte8 = stream bit 64..71
  await expect(inOverview(page, 'pbit:64')).toHaveClass(/\bis-related\b/);
  await expect(inOverview(page, 'pbit:71')).toHaveClass(/\bis-related\b/);
  await expect(inOverview(page, 'pbit:8')).toHaveClass(/\bis-dim\b/);
  await expect(page.locator('.inspector')).toContainText('装備');
});

test('フラグを編集すると is-changed が付き、呪文が変わる', async ({ page }) => {
  const before = await passwordText(page);
  await fieldRow(page, 'ゴーレム撃破').locator('.toggle').click();
  await expect(fieldRow(page, 'ゴーレム撃破').locator('.toggle')).toHaveText('ON');
  await expect(inPipeline(page, 'field:golem')).toHaveClass(/\bis-changed\b/);
  await expect(inPipeline(page, 'pbit:41')).toHaveClass(/\bis-changed\b/);
  expect(await passwordText(page)).not.toBe(before);
  await expect(page.locator('.pw-status')).toContainText('有効な呪文');
});

test('呪文を 1 文字変えると decode され、チェックコード不一致になる', async ({ page }) => {
  const last = page.locator('.password-panel .pw-cell').nth(19);
  const current = (await last.textContent())!;
  await last.click();
  const dialog = page.getByRole('dialog');
  // 今と違う文字を選ぶ（最後の文字は raw6[19] = byte14 にしか効かないので、check だけが合わなくなる）
  await dialog.locator('.palette-cell').filter({ hasNotText: current }).first().click();
  await expect(page.locator('.pw-status')).toContainText('チェックコード不一致');
  await expect(page.locator('.pw-status')).toContainText('呪文から decode');
  await expect(page.locator('.check-mismatch')).toBeVisible();
});

test('Explorer に入って戻っても GameState と選択状態が保たれる', async ({ page }) => {
  await fieldRow(page, 'ゴーレム撃破').locator('.toggle').click();
  await inPipeline(page, 'field:golem').click();
  await expect(inPipeline(page, 'field:golem')).toHaveAttribute('aria-pressed', 'true');
  const pw = await passwordText(page);

  await page.getByRole('button', { name: 'チェックコード計算を 1 step ずつ見る' }).click();
  await expect(page.getByRole('heading', { name: 'CHECK CODE EXPLORER' })).toBeVisible();
  await page.getByRole('button', { name: '最後' }).click();
  await expect(page.locator('.final')).toContainText('一致');
  await page.getByRole('button', { name: '← メインビューに戻る' }).click();

  await expect(fieldRow(page, 'ゴーレム撃破').locator('.toggle')).toHaveText('ON');
  await expect(inPipeline(page, 'field:golem')).toHaveAttribute('aria-pressed', 'true');
  expect(await passwordText(page)).toBe(pw);
});

test.describe('レイアウト', () => {
  test('1600px 幅でパイプラインが横にはみ出さない', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const overflow = await page.locator('.pipeline-scroll').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('390px 幅でページ全体が横スクロールしない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('スマホ幅ではインスペクタが畳まれ、全文ボタンで展開・固定解除ができる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const inspector = page.locator('.inspector');
    const height = () => inspector.evaluate((e) => e.getBoundingClientRect().height);
    await inPipeline(page, 'field:check').click();
    // 2 行 + 余白に収まる（画面の 1 割未満）
    expect(await height()).toBeLessThan(844 * 0.1);
    await expect(inspector.locator('.inspector-legend')).toBeHidden();

    await inspector.getByRole('button', { name: '全文 ▲' }).click();
    await expect(inspector.locator('.inspector-legend')).toBeVisible();
    expect(await height()).toBeLessThanOrEqual(844 * 0.5);
    await inspector.getByRole('button', { name: '畳む ▼' }).click();
    await expect(inspector.locator('.inspector-legend')).toBeHidden();

    await inspector.getByRole('button', { name: '固定を解除' }).click();
    await expect(inPipeline(page, 'field:check')).toHaveAttribute('aria-pressed', 'false');
  });

  test('PC 幅ではインスペクタを畳まない', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(page.locator('.inspector-toggle')).toBeHidden();
    await expect(page.locator('.inspector-legend')).toBeVisible();
  });
});
