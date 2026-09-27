import { test, expect } from '@playwright/test';

test(
    'EUV-UC3-001 · iniciar una adquisición de CDT',
    async ({ page }, testInfo) => {
        const amount = '89000000';
        const termKey = 540; // 18 meses

        let selectedBankId = '';
        let processId = '';

        await test.step(
            'PREPARACIÓN · inversionista autenticado y alternativa disponible',
            async () => {
                await page.goto('/');

                // La sesión autenticada es una precondición del EUV.
                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

                await expect(
                    page.locator('#simulator-investment-amount')
                ).toHaveCount(1);

                await page
                    .locator('#simulator-investment-amount')
                    .fill(amount);

                await page
                    .locator(`#simulator-term-${termKey}`)
                    .click();

                await page
                    .locator('#simulator-submit')
                    .click();

                await expect(
                    page.locator('#simulator-results')
                ).toBeVisible();
            },
        );

        await test.step(
            'DADO una alternativa disponible para continuar la adquisición',
            async () => {
                const offerIds = await page
                    .locator('[id^="simulator-offer-open-"]')
                    .evaluateAll(elements =>
                        elements.map(element => element.id)
                    );

                expect(
                    offerIds.length,
                    'debe existir al menos una alternativa disponible'
                ).toBeGreaterThan(0);

                /*
                 * Seleccionamos determinísticamente por identidad de dominio,
                 * NO por posición visual.
                 *
                 * simulator-offer-open-7 -> bank.id = 7
                 */
                const bankIds = offerIds
                    .map(id =>
                        Number(
                            id.replace('simulator-offer-open-', '')
                        )
                    )
                    .filter(Number.isFinite)
                    .sort((a, b) => a - b);

                expect(bankIds.length).toBeGreaterThan(0);

                selectedBankId = String(bankIds[0]);

                await expect(
                    page.locator(
                        `#simulator-offer-${selectedBankId}`
                    )
                ).toHaveCount(1);

                await expect(
                    page.locator(
                        `#simulator-offer-open-${selectedBankId}`
                    )
                ).toHaveCount(1);
            },
        );

        await test.step(
            'CUANDO solicita abrir el CDT seleccionado',
            async () => {
                await Promise.all([
                    page.waitForURL(
                        /\/portal\/process\/[^/?#]+/,
                        { timeout: 15_000 }
                    ),

                    page
                        .locator(
                            `#simulator-offer-open-${selectedBankId}`
                        )
                        .click(),
                ]);
            },
        );

        await test.step(
            'ENTONCES el sistema crea un proceso identificable para continuar la adquisición',
            async () => {
                const pathname = new URL(page.url()).pathname;

                const match = pathname.match(
                    /^\/portal\/process\/([^/]+)$/
                );

                expect(
                    match,
                    'la navegación debe contener un identificador de proceso'
                ).not.toBeNull();

                processId = match![1];

                expect(processId.length).toBeGreaterThan(0);

                // La sesión debe mantenerse durante la transición.
                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

                await expect(
                    page.locator('#global-nav-logout')
                ).toBeVisible();
            },
        );

        await testInfo.attach(
            'contexto-ejecucion',
            {
                body: Buffer.from(
                    JSON.stringify(
                        {
                            environment: process.env.TEST_ENV ?? 'dev',
                            amount: Number(amount),
                            termDays: termKey,
                            selectedBankId,
                            processId,
                            finalUrl: page.url(),
                        },
                        null,
                        2,
                    ),
                ),
                contentType: 'application/json',
            },
        );

        await testInfo.attach(
            'evidencia-proceso-creado',
            {
                body: await page.screenshot({
                    fullPage: true,
                }),
                contentType: 'image/png',
            },
        );
    },
);