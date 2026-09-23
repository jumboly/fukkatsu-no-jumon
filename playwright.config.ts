import { defineConfig, devices } from '@playwright/test';

// dev サーバーではなく本番ビルドを検査する。GitHub Pages に出るのは build 結果なので、そちらで壊れていないことを保証したい。
const PORT = 4179;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // build は呼び出し側（npm run test:e2e / CI）で済ませる。CI で 2 回ビルドしないため
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
