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

const DEFECTS_DIR =
    path.join(
        ROOT,
        'catalog',
        'defects'
    );

type DefectStatus =
    | 'open'
    | 'resolved';

type DefectSeverity =
    | 'low'
    | 'medium'
    | 'high'
    | 'critical';

interface ParexDefect {
    id: string;

    title: string;

    status:
    DefectStatus;

    severity:
    DefectSeverity;

    discovered_by:
    string[];

    related_scenarios:
    string[];

    component:
    string[];

    description:
    string;

    impact:
    string;

    root_cause:
    string;

    workaround:
    string | null;

    resolution:
    string | null;

    evidence: {
        type: string;
        source: string;
        notes: string;
    };

    tags:
    string[];
}

interface DefectEntry {
    filePath:
    string;

    relativePath:
    string;

    raw:
    string;

    hash:
    string;

    defect:
    ParexDefect;
}

function normalizePath(
    value: string
): string {
    return value.replace(
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

function loadDefects():
    DefectEntry[] {
    return walkFiles(
        DEFECTS_DIR
    )
        .filter(
            (filePath) =>
                filePath.endsWith(
                    '.yaml'
                )
        )
        .sort()
        .map(
            (
                filePath
            ): DefectEntry => {
                const raw =
                    fs.readFileSync(
                        filePath,
                        'utf8'
                    );

                const defect =
                    YAML.parse(
                        raw
                    ) as ParexDefect;

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

                    defect,
                };
            }
        );
}

function validateDefects():
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
                'scripts/validate-defects.ts',
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
            'El catálogo de hallazgos es inválido. No se sincronizó PostgreSQL.'
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

async function ensureSchema(
    client:
        Client
): Promise<void> {
    /*
     * known_issues ya existía antes del catálogo de defectos.
     *
     * ALTER TABLE permite evolucionar una base existente sin
     * borrar el volumen Docker ni perder ejecuciones históricas.
     */
    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS severity VARCHAR(20);
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS impact TEXT;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS root_cause TEXT;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS resolution TEXT;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS discovered_by JSONB
        NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS related_scenarios JSONB
        NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS components JSONB
        NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS tags JSONB
        NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS evidence JSONB
        NOT NULL DEFAULT '{}'::jsonb;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS catalog_file TEXT;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS catalog_hash VARCHAR(64);
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS is_present BOOLEAN
        NOT NULL DEFAULT TRUE;
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();
    `);

    await client.query(`
        ALTER TABLE known_issues
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_known_issues_status
        ON known_issues(status);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_known_issues_severity
        ON known_issues(severity);
    `);

    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_known_issues_present
        ON known_issues(is_present);
    `);

    /*
     * Relación escenario ↔ hallazgo.
     *
     * Convertimos related_scenarios JSONB en filas consultables.
     */
    await client.query(`
        CREATE OR REPLACE VIEW vw_parex_scenario_issues AS

        SELECT
            scenario.value
                AS scenario_id,

            i.issue_id,

            i.title,

            i.description,

            i.status,

            i.severity,

            i.impact,

            i.root_cause,

            i.workaround,

            i.resolution,

            i.discovered_by,

            i.related_scenarios,

            i.components,

            i.tags,

            i.evidence,

            i.resolved_at,

            i.updated_at

        FROM known_issues i

        CROSS JOIN LATERAL
            jsonb_array_elements_text(
                i.related_scenarios
            ) AS scenario(value)

        WHERE
            i.is_present = TRUE;
    `);

    /*
     * Evidencias técnicas enriquecidas con definición y ejecución.
     *
     * Esta vista permitirá mostrar en Grafana:
     * escenario → run → evidencia.
     */
    await client.query(`
        CREATE OR REPLACE VIEW vw_parex_evidence_detail AS

        SELECT
            e.id,

            e.run_id,

            tr.environment,

            tr.started_at
                AS run_started_at,

            e.test_id,

            COALESCE(
                d.name,
                e.test_id
            ) AS scenario_name,

            d.use_case_id,

            d.use_case_name,

            e.evidence_type,

            e.name
                AS evidence_name,

            e.path
                AS evidence_path,

            e.metadata,

            e.created_at

        FROM evidences e

        JOIN test_runs tr
            ON tr.run_id =
               e.run_id

        LEFT JOIN test_definitions d
            ON d.test_id =
               e.test_id;
    `);
}

async function synchronize(
    client:
        Client,
    entries:
        DefectEntry[]
): Promise<void> {
    /*
     * No eliminamos hallazgos antiguos.
     *
     * Si desaparecen del catálogo simplemente dejan de formar
     * parte del catálogo vigente.
     */
    await client.query(`
        UPDATE known_issues
        SET is_present = FALSE
        WHERE is_present = TRUE;
    `);

    for (
        const entry
        of entries
    ) {
        const defect =
            entry.defect;

        const status =
            defect.status
                .toUpperCase();

        const resolved =
            defect.status ===
            'resolved';

        await client.query(
            `
            INSERT INTO known_issues (
                issue_id,

                title,

                description,

                status,

                workaround,

                severity,

                impact,

                root_cause,

                resolution,

                discovered_by,

                related_scenarios,

                components,

                tags,

                evidence,

                catalog_file,

                catalog_hash,

                is_present,

                last_seen_at,

                updated_at,

                resolved_at
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
                $13::jsonb,
                $14::jsonb,
                $15,
                $16,
                TRUE,
                NOW(),
                NOW(),
                CASE
                    WHEN $17::boolean
                        THEN NOW()
                    ELSE NULL
                END
            )

            ON CONFLICT (issue_id)
            DO UPDATE SET
                title =
                    EXCLUDED.title,

                description =
                    EXCLUDED.description,

                status =
                    EXCLUDED.status,

                workaround =
                    EXCLUDED.workaround,

                severity =
                    EXCLUDED.severity,

                impact =
                    EXCLUDED.impact,

                root_cause =
                    EXCLUDED.root_cause,

                resolution =
                    EXCLUDED.resolution,

                discovered_by =
                    EXCLUDED.discovered_by,

                related_scenarios =
                    EXCLUDED.related_scenarios,

                components =
                    EXCLUDED.components,

                tags =
                    EXCLUDED.tags,

                evidence =
                    EXCLUDED.evidence,

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
                        WHEN known_issues.catalog_hash
                            IS DISTINCT FROM
                            EXCLUDED.catalog_hash
                        THEN NOW()
                        ELSE known_issues.updated_at
                    END,

                resolved_at =
                    CASE
                        WHEN EXCLUDED.status = 'RESOLVED'
                        THEN COALESCE(
                            known_issues.resolved_at,
                            NOW()
                        )
                        ELSE NULL
                    END;
            `,
            [
                defect.id,

                defect.title,

                defect.description,

                status,

                defect.workaround,

                defect.severity,

                defect.impact,

                defect.root_cause,

                defect.resolution,

                JSON.stringify(
                    defect.discovered_by
                ),

                JSON.stringify(
                    defect.related_scenarios
                ),

                JSON.stringify(
                    defect.component
                ),

                JSON.stringify(
                    defect.tags
                ),

                JSON.stringify(
                    defect.evidence
                ),

                entry.relativePath,

                entry.hash,

                resolved,
            ]
        );
    }
}

async function printSummary(
    client:
        Client
): Promise<void> {
    const result =
        await client.query(`
            SELECT
                COUNT(*) FILTER (
                    WHERE is_present = TRUE
                )::int
                    AS defects,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND status = 'OPEN'
                )::int
                    AS open,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND status = 'RESOLVED'
                )::int
                    AS resolved,

                COUNT(*) FILTER (
                    WHERE
                        is_present = TRUE
                        AND severity = 'critical'
                )::int
                    AS critical

            FROM known_issues;
        `);

    const summary =
        result.rows[0];

    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ' PAREX · Hallazgos → PostgreSQL'
    );
    console.log(
        '=========================================='
    );
    console.log(
        `Defectos   : ${summary.defects}`
    );
    console.log(
        `Abiertos    : ${summary.open}`
    );
    console.log(
        `Resueltos   : ${summary.resolved}`
    );
    console.log(
        `Críticos    : ${summary.critical}`
    );
    console.log(
        'Estado      : SYNCHRONIZED'
    );
    console.log(
        '=========================================='
    );
    console.log('');
}

async function main():
    Promise<void> {
    validateDefects();

    const entries =
        loadDefects();

    const client =
        databaseClient();

    await client.connect();

    try {
        await client.query(
            'BEGIN'
        );

        await ensureSchema(
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
                'PAREX DEFECT SYNC ERROR'
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