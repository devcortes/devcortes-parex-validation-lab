import { test, expect } from '@playwright/test';

test(
    '@smoke · el simulador público permite iniciar una simulación',
    async ({ page }) => {

        await page.goto('/');

        await expect(
            page.getByRole('button', {
                name: /Ver mis opciones/i,
            })
        ).toBeVisible();

        await page
            .getByRole('button', {
                name: /Ver mis opciones/i,
            })
            .click();

        const amount = page.getByRole('spinbutton', {
            name: '5.000.000',
        });

        await expect(amount).toBeVisible();

        await amount.fill('5000900');

        await page
            .getByRole('button', {
                name: '3 meses',
            })
            .click();
    }
);