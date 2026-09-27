import { test, expect } from '@playwright/test';

test('DISCOVERY · listar identificadores estables de ofertas', async ({ page }) => {
    await page.goto('/');

    await expect(
        page.locator('#simulator-investment-amount')
    ).toHaveCount(1);

    await page
        .locator('#simulator-investment-amount')
        .fill('89000000');

    await page
        .locator('#simulator-term-540')
        .click();

    await page
        .locator('#simulator-submit')
        .click();

    await expect(
        page.locator('#simulator-results')
    ).toBeVisible();

    const offerIds = await page
        .locator('[id^="simulator-offer-open-"]')
        .evaluateAll(elements =>
            elements.map(element => element.id)
        );

    console.log('');
    console.log('=== OFERTAS DISPONIBLES ===');
    console.log(offerIds);
    console.log('===========================');
});