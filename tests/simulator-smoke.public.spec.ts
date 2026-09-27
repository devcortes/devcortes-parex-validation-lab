import { test, expect } from '@playwright/test';

test(
    '@smoke · el simulador público permite iniciar una simulación',
    async ({ page }) => {
        await page.goto('/');

        await expect(
            page.locator('#simulator-investment-amount')
        ).toBeVisible();

        await page
            .locator('#simulator-investment-amount')
            .fill('5000900');

        await expect(
            page.locator('#simulator-term-360')
        ).toBeVisible();

        await page
            .locator('#simulator-term-360')
            .click();

        await page
            .locator('#simulator-submit')
            .click();

        await expect(
            page.locator('#simulator-results')
        ).toBeVisible();
    }
);