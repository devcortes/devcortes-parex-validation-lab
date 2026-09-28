import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
    spawnSync,
} from 'node:child_process';

import {
    Client,
} from 'pg';

import YAML from 'yaml';

const ROOT =
    process.cwd();

const CATALOG_DIR =
    path.join(
        ROOT,
        'catalog'
    );

type Environment =
    | 'dev'
    | 'pro';

type ScenarioKind =
    | 'euv'
    | 'validation'
    | 'precondition';

type RiskLevel =
    | 'low'
    | 'medium'
    | 'high'
    | 'critical';

interface ParexScenario {
    schema_version: number;

    id: string;

    name: string;

    kind: ScenarioKind;

    status: string;

    environment: {
        allowed: Environment[];
        default: Environment;
    };

    use_case?: {
        id: string;
        name: string;
    };

    capability?: string;

    objective: string;

    scenario: {
        given: string[];
        when: string[];
        then: string[];
    };

    risk: {
        level: RiskLevel;
        description: string;
    };

    coverage: {
        count_as_scenario: boolean;
    };

    automation: {
        framework: string;
        project: string;
        spec: string;
        runtime_id_template?: string;
    };

    preconditions: string[];

    testability_contract: string[];

    evidence: string[];

    tags: string[];

    suites: string[];

    architecture: string[];

    sequence: number;
}

interface CatalogEntry {
    filePath: string;

    relativePath: string;

    raw: string;

    hash: string;

    scenario: ParexScenario;
}

function normalizePath(
    value: string
): string {
    return value
        .replace(
            /\\/g,
            '/'
        );
}

function relativeToRoot(
    filePath: string
): string {
    return normalizePath(
        path.relative(
            ROOT,
            filePath
        )
    );
}

function walkFiles(
    directory: string
): string[] {
    if (
        !fs.existsSync(
            directory
        )
    ) {
        return [];
    }

    const files:
        string[] = [];

    for (
        const entry
        of fs.readdirSync(
            directory,
            {
                withFileTypes:
                    true,
            }
        )
    ) {
        const absolute =
            path.join(
                directory,
                entry.name
            );

        if (
            entry.isDirectory()
        ) {
            files.push(
                ...walkFiles(
                    absolute
                )
            );

            continue;
        }

        if (
            entry.isFile()
        ) {
            files.push(
                absolute
            );
        }
    }

    return files;
}

function loadCatalog():
    CatalogEntry[] {
    return walkFiles(
        CATALOG_DIR
    )
        .filter(
            (filePath) =>
                filePath.endsWith(
                    '.yaml'
                )
        )
        .filter(
            (filePath) =>
                !normalizePath(
                    filePath
                ).includes(
                    '/catalog/suites/'
                )
        )
        .sort()
        .map(
            (
                filePath
            ): CatalogEntry => {
                const raw =
                    fs.readFileSync(
                        filePath,
                        'utf8'
                    );

                const scenario =
                    YAML.parse(
                        raw
                    ) as ParexScenario;

                const hash =
                    crypto
                        .createHash(
                            'sha256'
                        )
                        .update(
                            raw
                        )
                        .digest(
                            'hex'
                        );

                return {
                    filePath,

                    relativePath:
                        relativeToRoot(
                            filePath
                        ),

                    raw,

                    hash,

                    scenario,
                };
            }
        );
}

function validateCatalog():
    void {
    const executable =
        process.platform ===
            'win32'
            ? 'npx.cmd'
            : 'npx';

    const result =
        spawnSync(
            executable,
            [
                'tsx',
                'scripts/validate-catalog.ts',
            ],
            {
                cwd:
                    ROOT,

                stdio:
                    'inherit',

                shell:
                    process.platform ===
                    'win32',
            }
        );

    if (
        result.status !==
        0
    ) {
        throw new Error(
            'El catálogo PAREX es inválido. No se sincronizó PostgreSQL.'
        );
    }
}

function databaseClient():
    Client {
    return new Client({
        host:
            process.env
                .PAREX_DB_HOST ??
            'localhost',

        port:
            Number(
                process.env
                    .PAREX_DB_PORT ??
                55432
            ),

        database:
            process.env
                .PAREX_DB_NAME ??
            'parex',

        user:
            process.env
                .PAREX_DB_USER ??
            'parex',

        password:
            process.env
                .PAREX_DB_PASSWORD ??
            'parex_local',
    });
}

async function ensureSemanticSchema(
    client: Client
): Promise<void> {
    await client.query(`
        CREATE TABLE IF NOT EXISTS test_definitions (
            test_id VARCHAR(100) PRIMARY KEY,

            schema_version INTEGER NOT NULL,

            name TEXT NOT NULL,

            kind VARCHAR(30) NOT NULL,

            catalog_status VARCHAR(30) NOT NULL,

            capability VARCHAR(100),

            use_case_id VARCHAR(30),

            use_case_name TEXT,

            objective TEXT NOT NULL,

            given_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

            when_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

            then_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

            risk_level VARCHAR(20) NOT NULL,

            risk_description TEXT NOT NULL,

            count_as_scenario BOOLEAN NOT NULL,

            allowed_environments JSONB NOT NULL DEFAULT '[]'::jsonb,

            default_environment VARCHAR(20) NOT NULL,

            automation_framework VARCHAR(50) NOT NULL,

            automation_project VARCHAR(100) NOT NULL,

            automation_spec TEXT NOT NULL,

            runtime_id_template TEXT,

            preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,

            testability_contract JSONB NOT NULL DEFAULT '[]'::jsonb,

            evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

            tags JSONB NOT NULL DEFAULT '[]'::jsonb,

            suites JSONB NOT NULL DEFAULT '[]'::jsonb,

            architecture JSONB NOT NULL DEFAULT '[]'::jsonb,

            sequence INTEGER NOT NULL DEFAULT 0,

            catalog_file TEXT NOT NULL,

            catalog_hash VARCHAR(64) NOT NULL,

            is_present BOOLEAN NOT NULL DEFAULT TRUE,

            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT chk_test_definitions_kind
                CHECK (
                    kind IN (
                        'euv',
                        'validation',
                        'precondition'
                    )
                ),

            CONSTRAINT chk_test_definitions_risk
                CHECK (
                    risk_level IN (
                        'low',
                        'medium',
                        'high',
                        'critical'
                    )
                ),

            CONSTRAINT chk_test_definitions_given_array
                CHECK (
                    jsonb_typeof(given_steps) = 'array'
                ),

            CONSTRAINT chk_test_definitions_when_array
                CHECK (
                    jsonb_typeof(when_steps) = 'array'
                ),

            CONSTRAINT chk_test_definitions_then_array
                CHECK (
                    jsonb_typeof(then_steps) = 'array'
                )
        );
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_test_definitions_kind
        ON test_definitions(kind);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_test_definitions_use_case
        ON test_definitions(use_case_id);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_test_definitions_risk
        ON test_definitions(risk_level);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_test_definitions_present
        ON test_definitions(is_present);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_test_definitions_count_scenario
        ON test_definitions(count_as_scenario);
    `);

    await client.query(`
        CREATE OR REPLACE VIEW vw_parex_test_results_semantic AS
        SELECT
            r.id,

            r.run_id,

            r.test_id,

            r.environment,

            r.status,

            r.duration_ms,

            r.started_at,

            r.finished_at,

            r.has_workaround,

            r.known_issue,

            r.error_message,

            r.title AS runtime_title,

            r.test_type AS runtime_test_type,

            r.use_case AS runtime_use_case,

            d.test_id IS NOT NULL
                AS catalog_registered,

            COALESCE(
                d.name,
                r.title
            ) AS scenario_name,

            COALESCE(
                UPPER(d.kind),
                r.test_type
            ) AS semantic_type,

            d.catalog_status,

            d.capability,

            COALESCE(
                d.use_case_id,
                r.use_case
            ) AS use_case_id,

            d.use_case_name,

            d.objective,

            d.given_steps,

            d.when_steps,

            d.then_steps,

            d.risk_level,

            d.risk_description,

            COALESCE(
                d.count_as_scenario,
                CASE
                    WHEN r.test_type = 'PRECONDITION'
                        THEN FALSE
                    ELSE TRUE
                END
            ) AS count_as_scenario,

            d.allowed_environments,

            d.default_environment,

            d.automation_framework,

            d.automation_project,

            d.automation_spec,

            d.runtime_id_template,

            d.preconditions,

            d.testability_contract,

            d.evidence,

            d.tags,

            d.suites,

            d.architecture,

            d.sequence,

            d.is_present AS catalog_present

        FROM test_results r

        LEFT JOIN test_definitions d
            ON d.test_id = r.test_id;
    `);

    await client.query(`
        CREATE OR REPLACE VIEW vw_parex_catalog_scenarios AS
        SELECT
            test_id,

            name,

            kind,

            catalog_status,

            capability,

            use_case_id,

            use_case_name,

            objective,

            given_steps,

            when_steps,

            then_steps,

            risk_level,

            risk_description,

            allowed_environments,

            default_environment,

            automation_project,

            automation_spec,

            preconditions,

            tags,

            suites,

            architecture,

            sequence,

            updated_at

        FROM test_definitions

        WHERE
            is_present = TRUE
            AND count_as_scenario = TRUE;
    `);
}

async function synchronize(
    client: Client,
    entries: CatalogEntry[]
): Promise<void> {
    /*
     * No borramos definiciones históricas.
     *
     * Primero todas dejan de considerarse presentes.
     * Las encontradas en el catálogo actual vuelven a TRUE.
     */
    await client.query(`
        UPDATE test_definitions
        SET is_present = FALSE
        WHERE is_present = TRUE;
    `);

    for (
        const entry
        of entries
    ) {
        const scenario =
            entry.scenario;

        await client.query(
            `
            INSERT INTO test_definitions (
                test_id,
                schema_version,
                name,
                kind,
                catalog_status,
                capability,
                use_case_id,
                use_case_name,
                objective,
                given_steps,
                when_steps,
                then_steps,
                risk_level,
                risk_description,
                count_as_scenario,
                allowed_environments,
                default_environment,
                automation_framework,
                automation_project,
                automation_spec,
                runtime_id_template,
                preconditions,
                testability_contract,
                evidence,
                tags,
                suites,
                architecture,
                sequence,
                catalog_file,
                catalog_hash,
                is_present,
                last_seen_at,
                updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10::jsonb,
                $11::jsonb,
                $12::jsonb,
                $13,
                $14,
                $15,
                $16::jsonb,
                $17,
                $18,
                $19,
                $20,
                $21,
                $22::jsonb,
                $23::jsonb,
                $24::jsonb,
                $25::jsonb,
                $26::jsonb,
                $27::jsonb,
                $28,
                $29,
                $30,
                TRUE,
                NOW(),
                NOW()
            )

            ON CONFLICT (test_id)
            DO UPDATE SET
                schema_version =
                    EXCLUDED.schema_version,

                name =
                    EXCLUDED.name,

                kind =
                    EXCLUDED.kind,

                catalog_status =
                    EXCLUDED.catalog_status,

                capability =
                    EXCLUDED.capability,

                use_case_id =
                    EXCLUDED.use_case_id,

                use_case_name =
                    EXCLUDED.use_case_name,

                objective =
                    EXCLUDED.objective,

                given_steps =
                    EXCLUDED.given_steps,

                when_steps =
                    EXCLUDED.when_steps,

                then_steps =
                    EXCLUDED.then_steps,

                risk_level =
                    EXCLUDED.risk_level,

                risk_description =
                    EXCLUDED.risk_description,

                count_as_scenario =
                    EXCLUDED.count_as_scenario,

                allowed_environments =
                    EXCLUDED.allowed_environments,

                default_environment =
                    EXCLUDED.default_environment,

                automation_framework =
                    EXCLUDED.automation_framework,

                automation_project =
                    EXCLUDED.automation_project,

                automation_spec =
                    EXCLUDED.automation_spec,

                runtime_id_template =
                    EXCLUDED.runtime_id_template,

                preconditions =
                    EXCLUDED.preconditions,

                testability_contract =
                    EXCLUDED.testability_contract,

                evidence =
                    EXCLUDED.evidence,

                tags =
                    EXCLUDED.tags,

                suites =
                    EXCLUDED.suites,

                architecture =
                    EXCLUDED.architecture,

                sequence =
                    EXCLUDED.sequence,

                catalog_file =
                    EXCLUDED.catalog_file,

                catalog_hash =
                    EXCLUDED.catalog_hash,

                is_present =
                    TRUE,

                last_seen_at =
                    NOW(),

                updated_at =
                    CASE
                        WHEN test_definitions.catalog_hash
                            IS DISTINCT FROM
                            EXCLUDED.catalog_hash
                        THEN NOW()
                        ELSE test_definitions.updated_at
                    END;
            `,
            [
                scenario.id,

                scenario.schema_version,

                scenario.name,

                scenario.kind,

                scenario.status,

                scenario.capability ??
                null,

                scenario.use_case?.id ??
                null,

                scenario.use_case?.name ??
                null,

                scenario.objective,

                JSON.stringify(
                    scenario.scenario
                        .given
                ),

                JSON.stringify(
                    scenario.scenario
                        .when
                ),

                JSON.stringify(
                    scenario.scenario
                        .then
                ),

                scenario.risk
                    .level,

                scenario.risk
                    .description,

                scenario.coverage
                    .count_as_scenario,

                JSON.stringify(
                    scenario.environment
                        .allowed
                ),

                scenario.environment
                    .default,

                scenario.automation
                    .framework,

                scenario.automation
                    .project,

                scenario.automation
                    .spec,

                scenario.automation
                    .runtime_id_template ??
                null,

                JSON.stringify(
                    scenario.preconditions
                ),

                JSON.stringify(
                    scenario.testability_contract
                ),

                JSON.stringify(
                    scenario.evidence
                ),

                JSON.stringify(
                    scenario.tags
                ),

                JSON.stringify(
                    scenario.suites
                ),

                JSON.stringify(
                    scenario.architecture
                ),

                scenario.sequence,

                entry.relativePath,

                entry.hash,
            ]
        );
    }
}

async function printSummary(
    client: Client
): Promise<void> {
    const result =
        await client.query(`
            SELECT
                COUNT(*) FILTER (
                    WHERE is_present = TRUE
                )::int
                    AS definitions,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND count_as_scenario = TRUE
                )::int
                    AS scenarios,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND kind = 'euv'
                        AND count_as_scenario = TRUE
                )::int
                    AS euv,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND kind = 'validation'
                        AND count_as_scenario = TRUE
                )::int
                    AS validations,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND kind = 'precondition'
                )::int
                    AS preconditions

            FROM test_definitions;
        `);

    const summary =
        result.rows[0];

    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ' PAREX Catalog → PostgreSQL'
    );
    console.log(
        '=========================================='
    );
    console.log(
        `Definitions   : ${summary.definitions}`
    );
    console.log(
        `Scenarios     : ${summary.scenarios}`
    );
    console.log(
        `EUV           : ${summary.euv}`
    );
    console.log(
        `Validations   : ${summary.validations}`
    );
    console.log(
        `Preconditions : ${summary.preconditions}`
    );
    console.log(
        'Status        : SYNCHRONIZED'
    );
    console.log(
        '=========================================='
    );
    console.log('');
}

async function main():
    Promise<void> {
    validateCatalog();

    const entries =
        loadCatalog();

    const client =
        databaseClient();

    await client.connect();

    try {
        await client.query(
            'BEGIN'
        );

        await ensureSemanticSchema(
            client
        );

        await synchronize(
            client,
            entries
        );

        await client.query(
            'COMMIT'
        );

        await printSummary(
            client
        );
    } catch (
    error
    ) {
        await client.query(
            'ROLLBACK'
        );

        throw error;
    } finally {
        await client.end();
    }
}

main()
    .catch(
        (
            error
        ) => {
            console.error('');
            console.error(
                'PAREX CATALOG SYNC ERROR'
            );
            console.error(
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    )
            );
            console.error('');

            process.exit(1);
        }
    );