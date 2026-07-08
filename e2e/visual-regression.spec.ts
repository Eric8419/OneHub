import { test, expect } from '@playwright/test';

// ── Visual regression: page layouts at desktop width ────────

test.describe('Dashboard page visual regression', () => {
  test('should render KPI cards grid at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/dashboard');
    await page.waitForTimeout(1000);

    // Verify all 4 KPI cards are visible
    const kpiGrid = page.locator('.ds-card').first();
    await expect(kpiGrid).toBeVisible();

    // Check for expected content text
    await expect(page.getByText('Token 总用量')).toBeVisible();
    await expect(page.getByText('请求总数')).toBeVisible();
    await expect(page.getByText('活跃模型')).toBeVisible();
    await expect(page.getByText('平均响应时间')).toBeVisible();
  });

  test('should render chart containers', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/dashboard');
    await page.waitForTimeout(1000);

    // Token trend chart
    await expect(page.getByText('Token 用量趋势')).toBeVisible();
    // Model distribution chart
    await expect(page.getByText('模型调用分布')).toBeVisible();
    // Heatmap
    await expect(page.getByText('调用热力图')).toBeVisible();
  });

  test('should render recent requests table', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/dashboard');
    await page.waitForTimeout(1000);

    await expect(page.getByText('近期调用记录')).toBeVisible();
  });
});

test.describe('ModelConfig page visual regression', () => {
  test('should render provider cards at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/models');
    await page.waitForTimeout(1000);

    // Page title
    await expect(page.getByText('模型配置')).toBeVisible();
    // Add provider button
    await expect(page.getByText('添加提供商')).toBeVisible();
  });

  test('should render aggregation table', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/models');

    await expect(page.getByText('模型聚合规则')).toBeVisible();
    await expect(page.getByText('聚合名称')).toBeVisible();
    await expect(page.getByText('路由策略')).toBeVisible();
  });
});

test.describe('Settings page visual regression', () => {
  test('should render general settings at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);

    await expect(page.getByText('代理服务')).toBeVisible();
    await expect(page.getByText('基本设置')).toBeVisible();
    await expect(page.getByText('语言')).toBeVisible();
  });

  test('should render security settings section', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/settings');

    // Click security tab
    await page.getByText('安全与认证').click();
    await page.waitForTimeout(500);

    await expect(page.getByText('本地认证令牌')).toBeVisible();
    await expect(page.getByText('启用 CORS')).toBeVisible();
  });
});

test.describe('Responsive layout checks', () => {
  test('should not overflow at minimum window width (960px)', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await page.goto('/#/dashboard');
    await page.waitForTimeout(1000);

    // Check no horizontal overflow
    const overflowWidth = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflowWidth).toBeLessThanOrEqual(20);
  });

  test('should not overflow at 1280px on settings page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/settings');
    await page.waitForTimeout(1000);

    const overflowWidth = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflowWidth).toBeLessThanOrEqual(20);
  });
});

test.describe('Navigation flow', () => {
  test('should navigate between all pages', async ({ page }) => {
    await page.goto('/#/dashboard');
    await page.waitForTimeout(500);

    // Navigate to models
    await page.getByText('模型配置').click();
    await page.waitForURL('**/#/models');
    await expect(page.getByText('模型配置')).toBeVisible();

    // Navigate to settings
    await page.getByText('设置').click();
    await page.waitForURL('**/#/settings');
    await expect(page.getByText('代理服务')).toBeVisible();

    // Navigate back to dashboard
    await page.getByText('仪表盘').click();
    await page.waitForURL('**/#/dashboard');
    await expect(page.getByText('Token 总用量')).toBeVisible();
  });
});
