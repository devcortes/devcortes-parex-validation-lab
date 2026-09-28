# ADR-006 · Conservación local de evidencias de ejecución

## Estado

Aceptada.

## Contexto

Playwright genera evidencias asociadas a varios escenarios del PAREX
Validation Lab.

Entre ellas se encuentran:

- capturas PNG;
- estados JSON;
- traces;
- videos u otros attachments cuando estén habilitados.

El reporter JSON de Playwright puede entregar estas evidencias de dos formas:

1. mediante una ruta de archivo;
2. mediante contenido inline codificado en Base64.

Durante las ejecuciones actuales se observó que las evidencias funcionales
principales se encuentran principalmente en formato inline.

El ingestor registraba la existencia y metadata de dichas evidencias en
PostgreSQL, pero no conservaba físicamente el contenido inline.

Por esta razón Grafana podía indicar que una evidencia existió, aunque no
existiera posteriormente un archivo local asociado.

## Decisión

El ingestor materializa localmente los attachments disponibles.

La estructura utilizada es:

```text
artifacts/
└── <run-id>/
    ├── manifest.json
    └── <test-id>/
        ├── 01-evidencia.png
        └── 02-estado.json