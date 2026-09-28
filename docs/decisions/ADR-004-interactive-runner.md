# ADR-004 · Interfaz interactiva sobre el runner PAREX

## Estado

Aceptada.

## Contexto

El runner PAREX permite ejecutar escenarios mediante comandos explícitos.

Ejemplos:

```bash
npm run parex -- run EUV-UC3-009
npm run parex -- run --suite signing
npm run parex -- run --uc UC3