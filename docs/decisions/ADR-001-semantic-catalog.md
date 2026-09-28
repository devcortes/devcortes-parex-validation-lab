# ADR-001 · Catálogo semántico como fuente de verdad de las validaciones PAREX

## Estado

Aceptada.

## Contexto

El PAREX Validation Lab comenzó con pruebas automatizadas en Playwright y
un mecanismo de persistencia de resultados en PostgreSQL.

Este enfoque permitió ejecutar escenarios reales contra el ambiente DEV,
conservar resultados y visualizarlos posteriormente en Grafana.

Sin embargo, el significado funcional de cada prueba se encontraba
distribuido entre:

- el nombre del archivo Playwright;
- el título declarado dentro del spec;
- el conocimiento de quien construyó la automatización;
- los códigos almacenados en PostgreSQL;
- y los paneles de Grafana.

Un identificador como `EUV-UC3-009` permite localizar una prueba, pero no
explica por sí mismo qué comportamiento se está validando, qué riesgo cubre,
qué caso de uso representa, qué precondiciones necesita o qué componentes
arquitectónicos participan.

Esta limitación se vuelve especialmente visible cuando los resultados son
consultados por personas que no desarrollaron las pruebas.

## Decisión

El PAREX Validation Lab utilizará un catálogo semántico versionado en YAML
como fuente de verdad del significado de cada escenario de validación.

Cada escenario declarará como mínimo:

- identificador;
- nombre funcional;
- tipo de escenario;
- ambiente permitido;
- objetivo;
- Dado / Cuando / Entonces;
- riesgo cubierto;
- relación con caso de uso o capacidad funcional;
- automatización que lo implementa;
- precondiciones;
- contrato de testabilidad;
- evidencias esperadas;
- etiquetas;
- conjuntos de ejecución;
- componentes arquitectónicos relacionados;
- y posición dentro de su flujo funcional.

Los archivos Playwright continuarán siendo responsables de ejecutar la
automatización, pero dejarán de ser la fuente principal del significado
funcional de la prueba.

## Separación entre significado y ejecución

El catálogo responde principalmente:

> ¿Qué comportamiento estamos validando y por qué?

Playwright responde:

> ¿Cómo comprobamos automáticamente ese comportamiento?

PostgreSQL responde:

> ¿Qué ocurrió en cada ejecución?

Grafana responde:

> ¿Cómo podemos observar e interpretar esos resultados?

Esta separación evita que la semántica funcional quede acoplada al framework
de automatización.

## Precondiciones técnicas

Las preparaciones requeridas para ejecutar un escenario pueden tener su
propia automatización y resultado.

Sin embargo, una precondición técnica no se considera automáticamente un
escenario funcional.

Por ejemplo:

`PRE-DEV-AUTH-001 · Usuario de pruebas válido y autenticable`

es necesario para ejecutar los escenarios autenticados del portal, pero no
representa por sí mismo un comportamiento de negocio que deba incrementar la
cobertura funcional.

Por esta razón el catálogo incorpora:

`coverage.count_as_scenario`

Esto permite diferenciar:

- pruebas ejecutadas;
- escenarios funcionales definidos;
- escenarios funcionales automatizados;
- y precondiciones técnicas ejecutadas.

## Formato YAML

Se eligió YAML porque el catálogo será revisado tanto por personas técnicas
como por personas interesadas en el comportamiento funcional.

Frente a mantener esta información únicamente dentro de TypeScript, YAML:

- reduce ruido sintáctico;
- facilita revisar cambios mediante Git;
- puede ser leído por el runner sin compilar código;
- puede alimentar PostgreSQL y Grafana;
- y permite generar documentación posterior a partir de la misma fuente.

## JSON Schema

Se incorpora un JSON Schema independiente para validar estructuralmente el
catálogo.

El objetivo es evitar que la flexibilidad de YAML produzca definiciones
inconsistentes.

El schema permite detectar, entre otros casos:

- escenarios sin nombre;
- tipos desconocidos;
- niveles de riesgo no válidos;
- rutas de automatización ausentes;
- estructuras Dado / Cuando / Entonces incompletas;
- ambientes no soportados;
- y campos no reconocidos.

## Relación con el runner PAREX

El runner utilizará el catálogo para resolver comandos semánticos.

Ejemplos previstos:

```bash
npm run parex -- list

npm run parex -- explain EUV-UC3-009

npm run parex -- run EUV-UC3-009

npm run parex -- run \
  EUV-UC3-006 \
  EUV-UC3-007 \
  EUV-UC3-008

npm run parex -- run --uc UC3

npm run parex -- run --suite signing

npm run parex -- run --tag security

npm run parex -- run --all