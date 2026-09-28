import fs from 'node:fs';
import path from 'node:path';

const ROOT =
    process.cwd();

const OUTPUT_DIR =
    path.join(
        ROOT,
        'infrastructure',
        'observability',
        'grafana',
        'provisioning',
        'dashboards',
        'json'
    );

const DATASOURCE = {
    type: 'postgres',
    uid: 'parex-postgres',
};

type QueryFormat =
    | 'table'
    | 'time_series';

function target(
    sql: string,
    refId = 'A',
    format: QueryFormat = 'table'
) {
    return {
        datasource:
            DATASOURCE,

        editorMode:
            'code',

        format,

        rawQuery:
            true,

        rawSql:
            sql,

        refId,
    };
}

function statPanel(
    id: number,
    title: string,
    sql: string,
    x: number,
    y: number,
    w = 4,
    h = 5,
    unit = 'short'
) {
    return {
        id,

        title,

        type:
            'stat',

        datasource:
            DATASOURCE,

        gridPos: {
            x,
            y,
            w,
            h,
        },

        fieldConfig: {
            defaults: {
                unit,
            },

            overrides: [],
        },

        options: {
            colorMode:
                'value',

            graphMode:
                'none',

            justifyMode:
                'auto',

            orientation:
                'auto',

            reduceOptions: {
                calcs: [
                    'lastNotNull',
                ],

                fields:
                    '',

                values:
                    false,
            },

            textMode:
                'auto',
        },

        targets: [
            target(
                sql
            ),
        ],
    };
}

function textStatPanel(
    id: number,
    title: string,
    sql: string,
    x: number,
    y: number,
    w = 4,
    h = 5,
    _unit = 'none'
) {
    return {
        id,

        title,

        type:
            'stat',

        datasource:
            DATASOURCE,

        gridPos: {
            x,
            y,
            w,
            h,
        },

        fieldConfig: {
            defaults: {},

            overrides: [],
        },

        options: {
            colorMode:
                'value',

            graphMode:
                'none',

            justifyMode:
                'auto',

            orientation:
                'auto',

            reduceOptions: {
                calcs: [],

                fields:
                    '/.*/',

                values:
                    true,

                limit:
                    1,
            },

            textMode:
                'value',
        },

        targets: [
            target(
                sql
            ),
        ],
    };
}


function tablePanel(
    id: number,
    title: string,
    sql: string,
    x: number,
    y: number,
    w = 24,
    h = 9
) {
    return {
        id,

        title,

        type:
            'table',

        datasource:
            DATASOURCE,

        gridPos: {
            x,
            y,
            w,
            h,
        },

        fieldConfig: {
            defaults: {},

            overrides: [],
        },

        options: {
            cellHeight:
                'sm',

            showHeader:
                true,
        },

        targets: [
            target(
                sql
            ),
        ],
    };
}

function timeSeriesPanel(
    id: number,
    title: string,
    sql: string,
    x: number,
    y: number,
    w = 12,
    h = 9
) {
    return {
        id,

        title,

        type:
            'timeseries',

        datasource:
            DATASOURCE,

        gridPos: {
            x,
            y,
            w,
            h,
        },

        fieldConfig: {
            defaults: {
                unit:
                    'percent',

                min:
                    0,

                max:
                    100,
            },

            overrides: [],
        },

        options: {
            legend: {
                displayMode:
                    'list',

                placement:
                    'bottom',
            },

            tooltip: {
                mode:
                    'single',
            },
        },

        targets: [
            target(
                sql,
                'A',
                'time_series'
            ),
        ],
    };
}

function environmentVariable() {
    return {
        name:
            'environment',

        label:
            'Ambiente',

        type:
            'query',

        datasource:
            DATASOURCE,

        definition:
            '',

        query:
            "SELECT DISTINCT UPPER(env.value) AS __text, UPPER(env.value) AS __value FROM test_definitions d CROSS JOIN LATERAL jsonb_array_elements_text(d.allowed_environments) AS env(value) WHERE d.is_present = TRUE ORDER BY 1;",

        refresh:
            1,

        includeAll:
            false,

        multi:
            false,

        current: {
            selected:
                true,

            text:
                'DEV',

            value:
                'DEV',
        },

        options: [],
    };
}

function scenarioVariable() {
    return {
        name:
            'scenario',

        label:
            'Escenario',

        type:
            'query',

        datasource:
            DATASOURCE,

        definition:
            '',

        query:
            "SELECT d.test_id || ' · ' || d.name AS __text, d.test_id AS __value FROM test_definitions d WHERE d.is_present = TRUE AND d.count_as_scenario = TRUE AND d.allowed_environments ? LOWER('${environment}') ORDER BY COALESCE(d.use_case_id, d.capability), d.sequence, d.test_id;",

        refresh:
            1,

        includeAll:
            false,

        multi:
            false,

        options: [],
    };
}

function baseDashboard(
    uid: string,
    title: string,
    panels: unknown[],
    variables: unknown[]
) {
    return {
        annotations: {
            list: [],
        },

        editable:
            true,

        fiscalYearStartMonth:
            0,

        graphTooltip:
            1,

        id:
            null,

        links: [],

        liveNow:
            false,

        panels,

        refresh:
            '10s',

        schemaVersion:
            39,

        tags: [
            'parex',
            'validation',
            'semantic',
            'observability',
        ],

        templating: {
            list:
                variables,
        },

        time: {
            from:
                'now-30d',

            to:
                'now',
        },

        timezone:
            'browser',

        title,

        uid,

        version:
            1,

        weekStart:
            '',
    };
}

function buildMainDashboard() {
    const latestRun =
        `WITH latest AS (
            SELECT run_id
            FROM test_runs
            WHERE environment = '\${environment}'
            ORDER BY started_at DESC
            LIMIT 1
        )`;

    const panels = [
        statPanel(
            1,
            'Escenarios definidos',
            `
            SELECT
                COUNT(*) AS "Escenarios definidos"
            FROM test_definitions d
            WHERE
                d.is_present = TRUE
                AND d.count_as_scenario = TRUE
                AND d.allowed_environments
                    ? LOWER('\${environment}');
            `,
            0,
            0
        ),

        statPanel(
            2,
            'Automatizados',
            `
            SELECT
                COUNT(*) AS "Automatizados"
            FROM test_definitions d
            WHERE
                d.is_present = TRUE
                AND d.count_as_scenario = TRUE
                AND d.catalog_status = 'automated'
                AND d.allowed_environments
                    ? LOWER('\${environment}');
            `,
            4,
            0
        ),

        statPanel(
            3,
            'Ejecutados · último run',
            `
            ${latestRun}

            SELECT
                COUNT(*) AS "Ejecutados"
            FROM vw_parex_test_results_semantic v
            JOIN latest l
                ON l.run_id = v.run_id
            WHERE
                v.count_as_scenario = TRUE;
            `,
            8,
            0
        ),

        statPanel(
            4,
            'PASS · escenarios',
            `
            ${latestRun}

            SELECT
                COUNT(*) AS "PASS"
            FROM vw_parex_test_results_semantic v
            JOIN latest l
                ON l.run_id = v.run_id
            WHERE
                v.count_as_scenario = TRUE
                AND v.status = 'PASS';
            `,
            12,
            0
        ),

        statPanel(
            5,
            'FAIL · escenarios',
            `
            ${latestRun}

            SELECT
                COUNT(*) AS "FAIL"
            FROM vw_parex_test_results_semantic v
            JOIN latest l
                ON l.run_id = v.run_id
            WHERE
                v.count_as_scenario = TRUE
                AND v.status = 'FAIL';
            `,
            16,
            0
        ),

        statPanel(
            6,
            'BLOCKED · escenarios',
            `
            ${latestRun}

            SELECT
                COUNT(*) AS "BLOCKED"
            FROM vw_parex_test_results_semantic v
            JOIN latest l
                ON l.run_id = v.run_id
            WHERE
                v.count_as_scenario = TRUE
                AND v.status = 'BLOCKED';
            `,
            20,
            0
        ),

        tablePanel(
            10,
            'Última ejecución · resultados por escenario',
            `
            ${latestRun}

            SELECT
                COALESCE(
                    v.use_case_id,
                    v.capability,
                    '-'
                ) AS "Contexto",

                v.test_id AS "ID",

                v.scenario_name AS "Escenario",

                UPPER(
                    COALESCE(
                        v.risk_level,
                        '-'
                    )
                ) AS "Riesgo",

                v.status AS "Estado",

                ROUND(
                    v.duration_ms / 1000.0,
                    2
                ) AS "Duración (s)",

                CASE
                    WHEN v.has_workaround
                        THEN 'SI'
                    ELSE 'NO'
                END AS "Workaround",

                COALESCE(
                    v.known_issue,
                    '-'
                ) AS "Defecto"

            FROM vw_parex_test_results_semantic v

            JOIN latest l
                ON l.run_id = v.run_id

            WHERE
                v.count_as_scenario = TRUE

            ORDER BY
                COALESCE(
                    v.use_case_id,
                    v.capability,
                    ''
                ),

                v.sequence NULLS LAST,

                v.test_id;
            `,
            0,
            5,
            24,
            11
        ),

        tablePanel(
            11,
            'Cobertura de automatización',
            `
            SELECT
                COALESCE(
                    d.use_case_id,
                    CASE d.capability
                        WHEN 'authentication' THEN 'Autenticación'
                        WHEN 'registration' THEN 'Registro'
                        ELSE d.capability
                    END,
                    'Sin contexto'
                ) AS "Contexto",

                COUNT(*) AS "Definidos",

                COUNT(*) FILTER (
                    WHERE
                        d.catalog_status = 'automated'
                ) AS "Automatizados",

                COUNT(*) FILTER (
                    WHERE
                        d.risk_level = 'critical'
                ) AS "Críticos",

                ROUND(
                    (
                        100.0 *
                        COUNT(*) FILTER (
                            WHERE
                                d.catalog_status = 'automated'
                        ) /
                        NULLIF(
                            COUNT(*),
                            0
                        )
                    )::numeric,
                    2
                ) AS "Cobertura %"

            FROM test_definitions d

            WHERE
                d.is_present = TRUE
                AND d.count_as_scenario = TRUE
                AND d.allowed_environments
                    ? LOWER('\${environment}')

            GROUP BY
                COALESCE(
                    d.use_case_id,
                    d.capability,
                    'Sin contexto'
                )

            ORDER BY 1;
            `,
            0,
            16,
            12,
            9
        ),

        tablePanel(
            12,
            'Precondiciones técnicas · último run',
            `
            ${latestRun}

            SELECT
                v.test_id AS "Precondición",

                v.scenario_name AS "Nombre",

                v.status AS "Estado",

                ROUND(
                    v.duration_ms / 1000.0,
                    2
                ) AS "Duración (s)"

            FROM vw_parex_test_results_semantic v

            JOIN latest l
                ON l.run_id = v.run_id

            WHERE
                v.count_as_scenario = FALSE

            ORDER BY
                v.test_id;
            `,
            12,
            16,
            12,
            9
        ),

        timeSeriesPanel(
            13,
            'Tasa de aprobación histórica',
            `
            SELECT
                tr.started_at AS "time",

                (
                    100.0 *
                    COUNT(*) FILTER (
                        WHERE
                            v.status = 'PASS'
                    ) /
                    NULLIF(
                        COUNT(*),
                        0
                    )
                )::double precision
                    AS "Tasa de aprobación"

            FROM test_runs tr

            JOIN vw_parex_test_results_semantic v
                ON v.run_id = tr.run_id

            WHERE
                tr.environment = '\${environment}'
                AND v.count_as_scenario = TRUE

            GROUP BY
                tr.run_id,
                tr.started_at

            ORDER BY
                tr.started_at;
            `,
            0,
            25,
            12,
            9
        ),

        tablePanel(
            14,
            'Hallazgos registrados',
            `
            SELECT
                issue_id AS "Defecto",

                title AS "Título",

                status AS "Estado",

                COALESCE(
                    workaround,
                    '-'
                ) AS "Workaround"

            FROM known_issues

            WHERE
                is_present = TRUE

            ORDER BY
                CASE
                    WHEN status = 'OPEN'
                        THEN 0
                    ELSE 1
                END,

                issue_id;
            `,
            12,
            25,
            12,
            9
        ),

        tablePanel(
            15,
            'Escenarios definidos',
            `
            SELECT
                d.test_id AS "ID",

                COALESCE(
                    d.use_case_id,
                    d.capability,
                    '-'
                ) AS "Contexto",

                d.name AS "Escenario",

                UPPER(
                    d.kind
                ) AS "Tipo",

                UPPER(
                    d.risk_level
                ) AS "Riesgo",

                UPPER(
                    d.catalog_status
                ) AS "Automatización",

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                x.value,
                                ', '
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.suites
                            ) AS x(value)
                    ),
                    '-'
                ) AS "Suites"

            FROM test_definitions d

            WHERE
                d.is_present = TRUE
                AND d.count_as_scenario = TRUE
                AND d.allowed_environments
                    ? LOWER('\${environment}')

            ORDER BY
                COALESCE(
                    d.use_case_id,
                    d.capability,
                    ''
                ),

                d.sequence,

                d.test_id;
            `,
            0,
            34,
            24,
            11
        ),
    ];

    return baseDashboard(
        'parex-validation',
        'PAREX · Cobertura y Ejecución',
        panels,
        [
            environmentVariable(),
        ]
    );
}

function buildScenarioDashboard() {
    const panels = [
        textStatPanel(
            1,
            'Último resultado',
            `
            SELECT
                v.status AS "Estado"

            FROM vw_parex_test_results_semantic v

            JOIN test_runs tr
                ON tr.run_id = v.run_id

            WHERE
                v.test_id = '\${scenario}'
                AND v.environment = '\${environment}'

            ORDER BY
                tr.started_at DESC

            LIMIT 1;
            `,
            0,
            0,
            6,
            5,
            'none'
        ),

        statPanel(
            2,
            'Última duración',
            `
            SELECT
                ROUND(
                    v.duration_ms / 1000.0,
                    2
                ) AS "Segundos"

            FROM vw_parex_test_results_semantic v

            JOIN test_runs tr
                ON tr.run_id = v.run_id

            WHERE
                v.test_id = '\${scenario}'
                AND v.environment = '\${environment}'

            ORDER BY
                tr.started_at DESC

            LIMIT 1;
            `,
            6,
            0,
            6,
            5,
            's'
        ),

        textStatPanel(
            3,
            'Nivel de riesgo',
            `
            SELECT
                UPPER(
                    risk_level
                ) AS "Riesgo"

            FROM test_definitions

            WHERE
                test_id = '\${scenario}';
            `,
            12,
            0,
            6,
            5,
            'none'
        ),

        textStatPanel(
            4,
            'Contexto funcional',
            `
            SELECT
                COALESCE(
                    use_case_id,
                    capability,
                    '-'
                ) AS "Contexto"

            FROM test_definitions

            WHERE
                test_id = '\${scenario}';
            `,
            18,
            0,
            6,
            5,
            'none'
        ),

        tablePanel(
            10,
            'Definición funcional',
            `
            SELECT
                d.test_id AS "ID",

                d.name AS "Nombre",

                CASE
                    WHEN d.use_case_id IS NOT NULL
                        THEN
                            d.use_case_id ||
                            ' · ' ||
                            d.use_case_name
                    ELSE
                        COALESCE(
                            d.capability,
                            '-'
                        )
                END AS "Contexto",

                d.objective AS "Objetivo",

                UPPER(
                    d.risk_level
                ) AS "Riesgo",

                d.risk_description AS "Riesgo cubierto"

            FROM test_definitions d

            WHERE
                d.test_id = '\${scenario}';
            `,
            0,
            5,
            24,
            8
        ),

        tablePanel(
            11,
            'Dado · Cuando · Entonces',
            `
            SELECT
                'DADO' AS "Etapa",

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                '• ' || x.value,
                                E'\\n'
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.given_steps
                            ) AS x(value)
                    ),
                    '-'
                ) AS "Descripción"

            FROM test_definitions d

            WHERE
                d.test_id = '\${scenario}'

            UNION ALL

            SELECT
                'CUANDO',

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                '• ' || x.value,
                                E'\\n'
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.when_steps
                            ) AS x(value)
                    ),
                    '-'
                )

            FROM test_definitions d

            WHERE
                d.test_id = '\${scenario}'

            UNION ALL

            SELECT
                'ENTONCES',

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                '• ' || x.value,
                                E'\\n'
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.then_steps
                            ) AS x(value)
                    ),
                    '-'
                )

            FROM test_definitions d

            WHERE
                d.test_id = '\${scenario}';
            `,
            0,
            13,
            24,
            9
        ),

        tablePanel(
            12,
            'Arquitectura y clasificación',
            `
            SELECT
                COALESCE(
                    (
                        SELECT
                            string_agg(
                                x.value,
                                ', '
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.architecture
                            ) AS x(value)
                    ),
                    '-'
                ) AS "Arquitectura",

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                x.value,
                                ', '
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.tags
                            ) AS x(value)
                    ),
                    '-'
                ) AS "Tags",

                COALESCE(
                    (
                        SELECT
                            string_agg(
                                x.value,
                                ', '
                            )
                        FROM
                            jsonb_array_elements_text(
                                d.suites
                            ) AS x(value)
                    ),
                    '-'
                ) AS "Suites",

                d.automation_project
                    AS "Proyecto",

                d.automation_spec
                    AS "Automatización"

            FROM test_definitions d

            WHERE
                d.test_id = '\${scenario}';
            `,
            0,
            22,
            24,
            7
        ),

        tablePanel(
            13,
            'Histórico de ejecuciones',
            `
            SELECT
                tr.started_at AS "Fecha",

                v.status AS "Estado",

                ROUND(
                    v.duration_ms / 1000.0,
                    2
                ) AS "Duración (s)",

                CASE
                    WHEN v.has_workaround
                        THEN 'SI'
                    ELSE 'NO'
                END AS "Workaround",

                COALESCE(
                    v.known_issue,
                    '-'
                ) AS "Defecto",

                COALESCE(
                    v.error_message,
                    '-'
                ) AS "Error"

            FROM vw_parex_test_results_semantic v

            JOIN test_runs tr
                ON tr.run_id = v.run_id

            WHERE
                v.test_id = '\${scenario}'
                AND v.environment = '\${environment}'

            ORDER BY
                tr.started_at DESC;
            `,
            0,
            29,
            24,
            10
        ),

        tablePanel(
            14,
            'Hallazgos relacionados',
            `
            SELECT
                issue_id AS "ID",

                UPPER(
                    severity
                ) AS "Severidad",

                status AS "Estado",

                title AS "Hallazgo",

                COALESCE(
                    impact,
                    '-'
                ) AS "Impacto",

                COALESCE(
                    workaround,
                    '-'
                ) AS "Workaround",

                COALESCE(
                    resolution,
                    '-'
                ) AS "Resolución"

            FROM vw_parex_scenario_issues

            WHERE
                scenario_id = '\${scenario}'

            ORDER BY
                CASE status
                    WHEN 'OPEN' THEN 0
                    ELSE 1
                END,

                CASE severity
                    WHEN 'critical' THEN 0
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    ELSE 3
                END,

                issue_id;
            `,
            0,
            39,
            24,
            10
        ),

        tablePanel(
            15,
            'Evidencias registradas',
            `
            SELECT
                run_started_at AS "Ejecución",

                evidence_type AS "Tipo",

                evidence_name AS "Evidencia",

                CASE
                    WHEN
                        COALESCE(
                            metadata ->> 'inline',
                            'false'
                        ) = 'true'
                    THEN 'INLINE'

                    WHEN evidence_path IS NOT NULL
                    THEN 'ARCHIVO'

                    ELSE 'REGISTRO'
                END AS "Origen",

                COALESCE(
                    metadata ->> 'project',
                    '-'
                ) AS "Proyecto",

                COALESCE(
                    metadata ->> 'bodyLength',
                    '-'
                ) AS "Longitud inline",

                COALESCE(
                    evidence_path,
                    '-'
                ) AS "Ruta"

            FROM vw_parex_evidence_detail

            WHERE
                test_id = '\${scenario}'
                AND environment = '\${environment}'

            ORDER BY
                run_started_at DESC,
                evidence_name

            LIMIT 100;
            `,
            0,
            49,
            24,
            11
        ),
    ];

    return baseDashboard(
        'parex-scenario-detail',
        'PAREX · Detalle de Escenario',
        panels,
        [
            environmentVariable(),
            scenarioVariable(),
        ]
    );
}

function writeDashboard(
    filename: string,
    dashboard: unknown
): void {
    fs.mkdirSync(
        OUTPUT_DIR,
        {
            recursive:
                true,
        }
    );

    const destination =
        path.join(
            OUTPUT_DIR,
            filename
        );

    fs.writeFileSync(
        destination,
        JSON.stringify(
            dashboard,
            null,
            4
        ) + '\n',
        'utf8'
    );

    console.log(
        `✓ ${path.relative(
            ROOT,
            destination
        )}`
    );
}

function main(): void {
    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ' PAREX · Grafana Dashboard Builder'
    );
    console.log(
        '=========================================='
    );
    console.log('');

    writeDashboard(
        'parex-validation.json',
        buildMainDashboard()
    );

    writeDashboard(
        'parex-scenario-detail.json',
        buildScenarioDashboard()
    );

    console.log('');
    console.log(
        'Status: GENERATED'
    );
    console.log('');
}

main();
