import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test(
    'EUV-UC3-004 · avanzar de documentación completa a firma',
    async ({ page }, testInfo) => {
        const amount = '89000000';
        const termKey = 540; // 18 meses

        let processId = '';
        let selectedBankId = '';

        /*
         * ============================================================
         * PREPARACIÓN
         * ============================================================
         *
         * El objetivo de esta sección es llevar el proceso hasta el
         * estado inmediatamente anterior al comportamiento que pretende
         * demostrar EUV-UC3-004.
         *
         * La preparación incluye:
         *
         * 1. Usuario autenticado.
         * 2. Simulación.
         * 3. Selección determinista de alternativa.
         * 4. Creación del proceso.
         * 5. Diligenciamiento del formulario.
         * 6. Transición a documentos.
         * 7. Registro de la declaración de renta.
         *
         * Ninguno de estos pasos constituye todavía el EUV-UC3-004.
         */

        await test.step(
            'PREPARACIÓN · existe un proceso con documentación registrada',
            async () => {
                /*
                 * ----------------------------------------------------------
                 * 1. Verificar precondición de autenticación
                 * ----------------------------------------------------------
                 *
                 * El proyecto "portal" utiliza el storageState generado por
                 * PRE-DEV-AUTH-001.
                 */
                await page.goto('/');

                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

                await expect(
                    page.locator('#global-nav-logout')
                ).toBeVisible();

                /*
                 * ----------------------------------------------------------
                 * 2. Preparar alternativa en el simulador
                 * ----------------------------------------------------------
                 */
                await expect(
                    page.locator('#simulator-investment-amount')
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

                /*
                 * ----------------------------------------------------------
                 * 3. Seleccionar una alternativa de forma determinista
                 * ----------------------------------------------------------
                 *
                 * No dependemos de:
                 *
                 * - nth()
                 * - posición visual
                 * - texto
                 * - clases CSS
                 *
                 * Descubrimos las identidades de dominio disponibles
                 * y seleccionamos el bank.id menor.
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

                /*
                 * ----------------------------------------------------------
                 * 4. Crear el proceso de adquisición
                 * ----------------------------------------------------------
                 */
                await Promise.all([
                    page.waitForURL(
                        /\/portal\/process\/[^/?#]+/,
                        {
                            timeout: 15_000,
                        }
                    ),

                    page
                        .locator(
                            `#simulator-offer-open-${selectedBankId}`
                        )
                        .click(),
                ]);

                const pathname = new URL(page.url()).pathname;

                const processMatch = pathname.match(
                    /^\/portal\/process\/([^/?#]+)$/
                );

                expect(
                    processMatch,
                    'la navegación debe contener un identificador de proceso'
                ).not.toBeNull();

                processId = processMatch![1];

                expect(
                    processId.length,
                    'el identificador del proceso no puede estar vacío'
                ).toBeGreaterThan(0);

                /*
                 * ----------------------------------------------------------
                 * 5. Verificar etapa Formulario
                 * ----------------------------------------------------------
                 */
                await expect(
                    page.locator('#process-stage-form')
                ).toBeVisible();

                await expect(
                    page.locator('#process-form')
                ).toBeVisible();

                /*
                 * Documento sintético y único para evitar colisiones
                 * entre ejecuciones.
                 */
                const uniqueDocument =
                    String(Date.now()).slice(-10);

                /*
                 * ----------------------------------------------------------
                 * 6. Completar información personal y financiera
                 * ----------------------------------------------------------
                 */
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
                 * ----------------------------------------------------------
                 * 7. Confirmar transición Formulario -> Documentos
                 * ----------------------------------------------------------
                 */
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

                /*
                 * ----------------------------------------------------------
                 * 8. Registrar declaración de renta sintética
                 * ----------------------------------------------------------
                 *
                 * No utilizamos información personal ni documentos reales.
                 *
                 * Este buffer representa un PNG válido de 1x1 pixel.
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

                await expect(
                    page.locator('#process-documents-input')
                ).toHaveCount(1);

                await page
                    .locator('#process-documents-input')
                    .setInputFiles(testDocument);

                /*
                 * No consideramos la preparación terminada simplemente
                 * porque el archivo fue seleccionado.
                 *
                 * Esperamos que vuelva a aparecer como archivo registrado
                 * por el sistema.
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

                await expect(
                    page.locator('#process-documents-view')
                ).toBeVisible();

                await expect(
                    page.locator('#process-documents-error')
                ).toHaveCount(0);

                /*
                 * Todavía debemos estar en el mismo proceso.
                 */
                await expect(page).toHaveURL(
                    new RegExp(
                        `/portal/process/${processId}(?:[/?#]|$)`
                    )
                );
            }
        );

        /*
         * ============================================================
         * AQUÍ COMIENZA EUV-UC3-004
         * ============================================================
         */

        await test.step(
            'DADO un proceso con la documentación requerida registrada',
            async () => {
                /*
                 * El usuario se encuentra efectivamente en Documentos.
                 */
                await expect(
                    page.locator('#process-stage-documents')
                ).toBeVisible();

                /*
                 * Existe evidencia observable del documento registrado.
                 */
                await expect(
                    page.locator('#process-documents-file')
                ).toBeVisible();

                await expect(
                    page.locator('#process-documents-view')
                ).toBeVisible();

                /*
                 * El sistema presenta el estímulo que permite avanzar.
                 */
                await expect(
                    page.locator('#process-advance-documents')
                ).toBeVisible();

                await expect(
                    page.locator('#process-advance-documents')
                ).toBeEnabled();

                /*
                 * No existe un error general del proceso antes de ejecutar
                 * la transición.
                 */
                await expect(
                    page.locator('#process-error')
                ).toHaveCount(0);
            }
        );

        await test.step(
            'CUANDO el inversionista solicita continuar a firma',
            async () => {
                await page
                    .locator('#process-advance-documents')
                    .click();
            }
        );

        await test.step(
            'ENTONCES el proceso abandona documentos y avanza a la etapa de firma',
            async () => {
                /*
                 * Oráculo principal:
                 *
                 * La etapa Signature debe quedar visible.
                 */
                await expect(
                    page.locator('#process-stage-signature')
                ).toBeVisible({
                    timeout: 15_000,
                });

                /*
                 * La etapa Documents debe desaparecer.
                 */
                await expect(
                    page.locator('#process-stage-documents')
                ).toHaveCount(0);

                /*
                 * El CTA específico de Documents tampoco debe seguir
                 * disponible después de la transición.
                 */
                await expect(
                    page.locator('#process-advance-documents')
                ).toHaveCount(0);

                /*
                 * No debe existir un error general del proceso.
                 */
                await expect(
                    page.locator('#process-error')
                ).toHaveCount(0);

                /*
                 * La transición no crea otro proceso:
                 * debe mantenerse el mismo processId.
                 */
                await expect(page).toHaveURL(
                    new RegExp(
                        `/portal/process/${processId}(?:[/?#]|$)`
                    )
                );

                /*
                 * La sesión también debe mantenerse.
                 */
                await expect(
                    page.locator('#global-nav-account')
                ).toBeVisible();

                await expect(
                    page.locator('#global-nav-logout')
                ).toBeVisible();
            }
        );

        /*
         * ============================================================
         * EVIDENCIA ESTRUCTURADA
         * ============================================================
         */
        await testInfo.attach(
            'contexto-ejecucion',
            {
                body: Buffer.from(
                    JSON.stringify(
                        {
                            environment:
                                process.env.TEST_ENV ?? 'dev',

                            euv: 'EUV-UC3-004',

                            description:
                                'Avanzar de documentación completa a firma',

                            processId,

                            selectedBankId,

                            amount: Number(amount),

                            termDays: termKey,

                            resultingStage: 'signature',

                            finalUrl: page.url(),
                        },
                        null,
                        2
                    )
                ),

                contentType: 'application/json',
            }
        );

        /*
         * Evidencia visual del estado final.
         */
        await testInfo.attach(
            'evidencia-etapa-firma',
            {
                body: await page.screenshot({
                    fullPage: true,
                }),

                contentType: 'image/png',
            }
        );
    }
);