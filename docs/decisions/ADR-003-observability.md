# ADR-003 · Observabilidad de la validación

## Estado

Aceptada.

## Contexto

El PAREX Validation Lab comenzó almacenando los resultados producidos por
Playwright en PostgreSQL y mostrándolos posteriormente en Grafana.

En esa primera aproximación, `test_results` contenía información como:

- identificador de prueba;
- tipo;
- caso de uso inferido;
- título;
- resultado;
- duración;
- workaround;
- defecto conocido.

Este modelo permitía responder qué había ocurrido durante una ejecución, pero
no representaba adecuadamente qué significaba funcionalmente cada escenario.

La incorporación del catálogo PAREX introdujo información estable que no debe
ser reconstruida a partir del nombre de un test:

- nombre funcional;
- objetivo;
- Dado / Cuando / Entonces;
- caso de uso;
- riesgo;
- arquitectura relacionada;
- suites;
- tags;
- precondiciones.

Persistir esta información directamente en cada resultado produciría
duplicación y convertiría una ejecución histórica en fuente de definición.

## Decisión

Se separan explícitamente dos responsabilidades.

### Definición del escenario

La tabla `test_definitions` representa qué significa una validación.

Su contenido se sincroniza desde el catálogo YAML y contiene la información
funcional y técnica relativamente estable del escenario.

### Resultado de ejecución

La tabla `test_results` representa qué ocurrió durante una ejecución
específica.

Conserva información dinámica como:

- run;
- ambiente;
- estado;
- duración;
- error;
- workaround;
- fechas.

El vínculo entre ambas estructuras se realiza mediante `test_id`.

## Fuente de verdad

Los archivos YAML continúan siendo la fuente de verdad de las definiciones.

PostgreSQL contiene una proyección consultable del catálogo para que Grafana
pueda relacionar definición y ejecución sin interpretar archivos YAML.

El flujo queda:

```text
Catálogo YAML
      ↓
sync-catalog.ts
      ↓
test_definitions

Playwright
      ↓
ingest-results.ts
      ↓
test_results

test_definitions + test_results
      ↓
vistas PostgreSQL
      ↓
Grafana