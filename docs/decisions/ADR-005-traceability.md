# ADR-005 · Trazabilidad entre escenarios, ejecuciones, evidencias y hallazgos

## Estado

Aceptada.

## Contexto

El laboratorio ya permitía definir escenarios, ejecutarlos con Playwright,
almacenar resultados y observar su histórico.

Sin embargo, un resultado PASS o FAIL por sí solo no explica qué información
permitió llegar a esa conclusión ni qué problemas fueron descubiertos durante
la automatización.

Durante la construcción del recorrido UC3 se detectaron problemas reales
relacionados con transición de estado, CORS y cálculo HMAC.

Mantener estos hallazgos únicamente en conversaciones, commits o conocimiento
del equipo reduciría el valor de la validación como evidencia del proceso.

## Decisión

El PAREX Validation Lab establece trazabilidad explícita entre cuatro tipos de
información:

```text
Definición del escenario
        ↓
Ejecución
        ↓
Evidencia
        ↓
Hallazgo