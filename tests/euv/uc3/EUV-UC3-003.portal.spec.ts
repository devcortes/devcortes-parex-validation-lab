import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test(
    'EUV-UC3-003 · registrar la documentación requerida de una adquisición',
    async ({ page }, testInfo) => {
        const amount = '89000000';
        const termKey = 540; // 18 meses

        let processId = '';
        let selectedBankId = '';

        /*
         * PREPARACIÓN
         * Llevamos el proceso hasta la etapa Documentos.
         * Esta preparación NO forma parte de lo que pretende demostrar
         * EUV-UC3-003.
         */
        await test.step(
            'PREPARACIÓN · existe un proceso en etapa Documentos',
            async () => {
                /*
                 * 1. Usuario autenticado.
                 * El proyecto "portal" depende de auth.setup.ts, por lo que
                 * storageState ya contiene la sesión DEV.
                 */
                await page.goto('/');

                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

                /*
                 * 2. Preparar alternativa en el simulador.
                 */
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

                /*
                 * 3. Escoger una alternativa de forma determinista.
                 * NO usamos nth(), posición visual ni texto.
                 */
                const offerIds = await page
                    .locator('[id^="simulator-offer-open-"]')
                    .evaluateAll((elements) =>
                        elements.map((element) => element.id)
                    );

                const bankIds = offerIds
                    .map((id) =>
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

                /*
                 * 4. Crear proceso real.
                 */
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

                const processMatch = pathname.match(
                    /\/portal\/process\/([^/?#]+)/
                );

                expect(
                    processMatch,
                    'debe existir un identificador de proceso'
                ).not.toBeNull();

                processId = processMatch![1];

                /*
                 * 5. Completar formulario personal/financiero.
                 */
                await expect(
                    page.locator('#process-stage-form')
                ).toBeVisible();

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
                    .fill('Calle de prueba PAREX 123');

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

                await page
                    .locator('#process-form-submit')
                    .click();

                /*
                 * 6. Confirmar transición real Formulario -> Documentos.
                 */
                await expect(
                    page.locator('#process-stage-documents')
                ).toBeVisible({
                    timeout: 15_000,
                });

                await expect(
                    page.locator('#process-form')
                ).toHaveCount(0);
            }
        );

        /*
         * AQUÍ COMIENZA EL EUV-UC3-003
         */
        await test.step(
            'DADO un proceso que requiere la declaración de renta',
            async () => {
                await expect(
                    page.locator('#process-stage-documents')
                ).toHaveCount(1);

                await expect(
                    page.locator('#process-documents-input')
                ).toHaveCount(1);

                await expect(
                    page.locator('#process-documents-empty')
                ).toBeVisible();
            }
        );

        /*
         * Documento totalmente sintético.
         * No usamos cédulas, declaraciones reales ni información personal.
         *
         * Es un PNG válido de 1x1 pixel.
         */
        const documentName =
            `declaracion-renta-parex-${Date.now()}.png`;

        const testDocument = {
            name: documentName,
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                'base64'
            ),
        };

        await test.step(
            'CUANDO el inversionista adjunta la documentación requerida',
            async () => {
                await page
                    .locator('#process-documents-input')
                    .setInputFiles(testDocument);
            }
        );

        await test.step(
            'ENTONCES el documento queda registrado y disponible en el proceso',
            async () => {
                /*
                 * Esta es la aserción importante.
                 *
                 * No basta con que Playwright haya cargado un archivo en el input.
                 * Esperamos hasta que el backend lo registre, el padre refresque
                 * d.files y ProcessDocumentsComponent vuelva a encontrar
                 * file_type === "declaracion_renta".
                 */
                const registeredFile =
                    page.locator('#process-documents-file');

                await expect(
                    registeredFile
                ).toBeVisible({
                    timeout: 40_000,
                });

                await expect(
                    registeredFile
                ).toContainText(documentName);

                /*
                 * Si aparece "Ver documento", significa que el componente
                 * ya tiene una FileRow registrada, no simplemente un archivo
                 * seleccionado localmente.
                 */
                await expect(
                    page.locator('#process-documents-view')
                ).toBeVisible();

                await expect(
                    page.locator('#process-documents-error')
                ).toHaveCount(0);

                /*
                 * Seguimos en el mismo proceso.
                 */
                await expect(page).toHaveURL(
                    new RegExp(`/portal/process/${processId}`)
                );
            }
        );

        /*
         * Evidencia estructurada de la ejecución.
         */
        await testInfo.attach(
            'contexto-ejecucion',
            {
                body: Buffer.from(
                    JSON.stringify(
                        {
                            environment:
                                process.env.TEST_ENV ?? 'dev',
                            euv: 'EUV-UC3-003',
                            processId,
                            selectedBankId,
                            amount: Number(amount),
                            termDays: termKey,
                            uploadedDocument: documentName,
                            resultingStage: 'documents',
                            finalUrl: page.url(),
                        },
                        null,
                        2
                    )
                ),
                contentType: 'application/json',
            }
        );

        await testInfo.attach(
            'evidencia-documento-registrado',
            {
                body: await page.screenshot({
                    fullPage: true,
                }),
                contentType: 'image/png',
            }
        );
    }
);