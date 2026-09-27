import { test, expect } from '@playwright/test';

test(
    'EUV-UC3-002 · completar información del inversionista y avanzar a documentos',
    async ({ page }, testInfo) => {

        const amount = '89000000';
        const termKey = 540; // 18 meses

        let processId = '';
        let selectedBankId = '';

        /*
         * PREPARACIÓN
         * No es todavía el comportamiento que pretende demostrar este EUV.
         */
        await test.step(
            'PREPARACIÓN · existe un proceso en etapa de formulario',
            async () => {
                await page.goto('/');

                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

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

                // Selección determinista por identidad de dominio.
                const ids = await page
                    .locator('[id^="simulator-offer-open-"]')
                    .evaluateAll(elements =>
                        elements.map(element => element.id)
                    );

                const bankIds = ids
                    .map(id =>
                        Number(
                            id.replace('simulator-offer-open-', '')
                        )
                    )
                    .filter(Number.isFinite)
                    .sort((a, b) => a - b);

                expect(
                    bankIds.length,
                    'debe existir al menos una alternativa disponible'
                ).toBeGreaterThan(0);

                selectedBankId = String(bankIds[0]);

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

                const pathname = new URL(page.url()).pathname;

                const match = pathname.match(
                    /^\/portal\/process\/([^/]+)$/
                );

                expect(match).not.toBeNull();

                processId = match![1];

                await expect(
                    page.locator('#process-stage-form')
                ).toBeVisible();

                await expect(
                    page.locator('#process-form')
                ).toBeVisible();
            }
        );

        /*
         * AQUÍ COMIENZA EL EUV.
         */
        await test.step(
            'DADO un proceso en etapa de información personal y financiera',
            async () => {
                await expect(
                    page.locator('#process-form')
                ).toHaveCount(1);

                await expect(
                    page.locator('#process-form-submit')
                ).toHaveCount(1);
            }
        );

        await test.step(
            'CUANDO el inversionista completa la información requerida',
            async () => {

                const uniqueDocument =
                    String(Date.now()).slice(-10);

                await page
                    .locator('#process-form-full-name')
                    .fill('Usuario PAREX E2E');

                await page
                    .locator('#process-form-birth-date')
                    .fill('1999-11-02');

                await page
                    .locator('#process-form-document-number')
                    .fill(uniqueDocument);

                await page
                    .locator('#process-form-phone')
                    .fill('3001234567');

                await page
                    .locator('#process-form-city')
                    .fill('Bogota');

                await page
                    .locator('#process-form-address')
                    .fill('Calle de prueba 123');

                await page
                    .locator('#process-form-occupation')
                    .fill('Ingeniero');

                await page
                    .locator('#process-form-economic-activity')
                    .fill('Empleado');

                await page
                    .locator('#process-form-monthly-income')
                    .fill('12000000');

                await page
                    .locator('#process-form-monthly-expenses')
                    .fill('5000000');

                await page
                    .locator('#process-form-total-assets')
                    .fill('20000000');

                await page
                    .locator('#process-form-total-liabilities')
                    .fill('1000000');

                await page
                    .locator('#process-form-source-of-funds')
                    .fill('Salario');
            }
        );

        await test.step(
            'Y solicita guardar y continuar',
            async () => {
                await page
                    .locator('#process-form-submit')
                    .click();
            }
        );

        await test.step(
            'ENTONCES el proceso abandona el formulario y avanza a documentos',
            async () => {

                await expect(
                    page.locator('#process-stage-documents')
                ).toBeVisible({
                    timeout: 15_000,
                });

                await expect(
                    page.locator('#process-stage-form')
                ).toHaveCount(0);

                await expect(
                    page.locator('#process-form')
                ).toHaveCount(0);

                // El proceso continúa siendo el mismo.
                await expect(page).toHaveURL(
                    new RegExp(`/portal/process/${processId}`)
                );
            }
        );

        await testInfo.attach(
            'contexto-ejecucion',
            {
                body: Buffer.from(
                    JSON.stringify(
                        {
                            environment: process.env.TEST_ENV ?? 'dev',
                            processId,
                            selectedBankId,
                            amount: Number(amount),
                            termDays: termKey,
                            resultingStage: 'documents',
                        },
                        null,
                        2
                    )
                ),
                contentType: 'application/json',
            }
        );

        await testInfo.attach(
            'evidencia-etapa-documentos',
            {
                body: await page.screenshot({
                    fullPage: true,
                }),
                contentType: 'image/png',
            }
        );
    }
);