# ADR-002 · Runner semántico como interfaz de ejecución del PAREX Validation Lab

## Estado

Aceptada.

## Contexto

Las pruebas del laboratorio se ejecutaban directamente mediante comandos de
Playwright.

Por ejemplo:

```bash
TEST_ENV=dev npx playwright test \
  tests/euv/uc3/EUV-UC3-009.portal.spec.ts \
  --project=portal \
  --headed