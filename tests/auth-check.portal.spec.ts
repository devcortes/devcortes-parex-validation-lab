import { test, expect } from '@playwright/test';

test(
    'PRECONDICIÓN · la sesión guardada permite acceder al portal',
    async ({ page }) => {

        await page.goto('/portal/');

        await page.waitForLoadState('domcontentloaded');

        await expect(page).not.toHaveURL(/\/portal\/login/);
    }
);