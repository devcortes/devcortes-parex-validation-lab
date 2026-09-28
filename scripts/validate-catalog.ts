import fs from 'node:fs';
import path from 'node:path';

import Ajv2020, {
    type ErrorObject,
    type ValidateFunction,
} from 'ajv/dist/2020.js';

import YAML from 'yaml';

const ROOT = process.cwd();

const CATALOG_DIR =
    path.join(
        ROOT,
        'catalog'
    );

const SCHEMA_PATH =
    path.join(
        CATALOG_DIR,
        'schema',
        'parex-scenario.schema.json'
    );

const SUITES_DIR =
    path.join(
        CATALOG_DIR,
        'suites'
    );

const TESTS_DIR =
    path.join(
        ROOT,
        'tests'
    );

type ScenarioKind =
    | 'euv'
    | 'validation'
    | 'precondition';

interface ScenarioAutomation {
    framework: string;
    project: string;
    spec: string;
    runtime_id_template?: string;
}

interface ScenarioCoverage {
    count_as_scenario: boolean;
}

interface ScenarioUseCase {
    id: string;
    name: string;
}

interface ParexScenario {
    schema_version: number;
    id: string;
    name: string;
    kind: ScenarioKind;
    status: string;

    use_case?: ScenarioUseCase;
    capability?: string;

    objective: string;

    coverage: ScenarioCoverage;

    automation: ScenarioAutomation;

    preconditions: string[];

    suites: string[];

    tags: string[];

    architecture: string[];

    sequence: number;
}

interface ParexSuite {
    id: string;
    name: string;
    description: string;
    purpose: string;

    execution: {
        order: number;
    };

    tags: string[];
}

interface CatalogEntry {
    filePath: string;
    relativePath: string;
    scenario: ParexScenario;
}

interface ValidationProblem {
    file?: string;
    message: string;
}

function normalizePath(
    value: string
): string {
    return value
        .replace(/\\/g, '/');
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

    const files: string[] =
        [];

    for (
        const entry
        of fs.readdirSync(
            directory,
            {
                withFileTypes: true,
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

function readJsonFile<T>(
    filePath: string
): T {
    return JSON.parse(
        fs.readFileSync(
            filePath,
            'utf8'
        )
    ) as T;
}

function readYamlFile<T>(
    filePath: string
): T {
    const source =
        fs.readFileSync(
            filePath,
            'utf8'
        );

    return YAML.parse(
        source
    ) as T;
}

function scenarioYamlFiles():
    string[] {
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
            (filePath) => {
                const relative =
                    normalizePath(
                        path.relative(
                            ROOT,
                            filePath
                        )
                    );

                return (
                    relative.startsWith(
                        'catalog/euv/'
                    ) ||
                    relative.startsWith(
                        'catalog/validation/'
                    ) ||
                    relative.startsWith(
                        'catalog/preconditions/'
                    )
                );
            }
        )
        .sort();
}

function suiteYamlFiles():
    string[] {
    return walkFiles(
        SUITES_DIR
    )
        .filter(
            (filePath) =>
                filePath.endsWith(
                    '.yaml'
                )
        )
        .sort();
}

function formatAjvError(
    error: ErrorObject
): string {
    const property =
        error.instancePath ||
        '/';

    return `${property} ${error.message ?? 'schema error'}`;
}

function validateScenarioSchema(
    validator:
        ValidateFunction,
    filePath: string,
    scenario: unknown,
    problems:
        ValidationProblem[]
): boolean {
    const valid =
        validator(
            scenario
        );

    if (valid) {
        return true;
    }

    for (
        const error
        of validator.errors ??
        []
    ) {
        problems.push({
            file:
                relativeToRoot(
                    filePath
                ),

            message:
                `Schema: ${formatAjvError(
                    error
                )}`,
        });
    }

    return false;
}

function loadSuites(
    problems:
        ValidationProblem[]
): Map<string, ParexSuite> {
    const suites =
        new Map<
            string,
            ParexSuite
        >();

    for (
        const filePath
        of suiteYamlFiles()
    ) {
        let suite:
            ParexSuite;

        try {
            suite =
                readYamlFile<ParexSuite>(
                    filePath
                );
        } catch (
        error
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    `No se pudo leer YAML: ${error instanceof Error
                        ? error.message
                        : String(
                            error
                        )
                    }`,
            });

            continue;
        }

        if (
            !suite ||
            typeof suite.id !==
            'string' ||
            !suite.id.trim()
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    'La suite no declara un id válido.',
            });

            continue;
        }

        const expectedFile =
            `${suite.id}.yaml`;

        if (
            path.basename(
                filePath
            ) !== expectedFile
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    `El nombre del archivo debe ser ${expectedFile}.`,
            });
        }

        if (
            suites.has(
                suite.id
            )
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    `Suite duplicada: ${suite.id}.`,
            });

            continue;
        }

        if (
            typeof suite.name !==
            'string' ||
            !suite.name.trim()
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    'La suite debe declarar name.',
            });
        }

        if (
            typeof suite.description !==
            'string' ||
            !suite.description.trim()
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    'La suite debe declarar description.',
            });
        }

        if (
            typeof suite.purpose !==
            'string' ||
            !suite.purpose.trim()
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    'La suite debe declarar purpose.',
            });
        }

        if (
            !Number.isInteger(
                suite.execution?.order
            )
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    'La suite debe declarar execution.order como entero.',
            });
        }

        suites.set(
            suite.id,
            suite
        );
    }

    return suites;
}

function loadScenarios(
    validator:
        ValidateFunction,
    problems:
        ValidationProblem[]
): CatalogEntry[] {
    const entries:
        CatalogEntry[] =
        [];

    for (
        const filePath
        of scenarioYamlFiles()
    ) {
        let parsed:
            unknown;

        try {
            parsed =
                readYamlFile<unknown>(
                    filePath
                );
        } catch (
        error
        ) {
            problems.push({
                file:
                    relativeToRoot(
                        filePath
                    ),

                message:
                    `No se pudo leer YAML: ${error instanceof Error
                        ? error.message
                        : String(
                            error
                        )
                    }`,
            });

            continue;
        }

        if (
            !validateScenarioSchema(
                validator,
                filePath,
                parsed,
                problems
            )
        ) {
            continue;
        }

        const scenario =
            parsed as ParexScenario;

        entries.push({
            filePath,
            relativePath:
                relativeToRoot(
                    filePath
                ),
            scenario,
        });
    }

    return entries;
}

function validateScenarioIds(
    entries:
        CatalogEntry[],
    problems:
        ValidationProblem[]
): Map<string, CatalogEntry> {
    const byId =
        new Map<
            string,
            CatalogEntry
        >();

    for (
        const entry
        of entries
    ) {
        const {
            scenario,
        } = entry;

        const expectedFilename =
            `${scenario.id}.yaml`;

        if (
            path.basename(
                entry.filePath
            ) !== expectedFilename
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `El archivo debe llamarse ${expectedFilename}.`,
            });
        }

        const existing =
            byId.get(
                scenario.id
            );

        if (
            existing
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `ID duplicado ${scenario.id}. Ya está declarado en ${existing.relativePath}.`,
            });

            continue;
        }

        byId.set(
            scenario.id,
            entry
        );
    }

    return byId;
}

function automationRuntimeMarker(
    scenario:
        ParexScenario
): string {
    return (
        scenario
            .automation
            .runtime_id_template ??
        scenario.id
    );
}

function validateAutomationSpecs(
    entries:
        CatalogEntry[],
    problems:
        ValidationProblem[]
): void {
    const specOwners =
        new Map<
            string,
            string
        >();

    for (
        const entry
        of entries
    ) {
        const {
            scenario,
        } = entry;

        const normalizedSpec =
            normalizePath(
                scenario
                    .automation
                    .spec
            );

        const absoluteSpec =
            path.resolve(
                ROOT,
                normalizedSpec
            );

        if (
            !fs.existsSync(
                absoluteSpec
            )
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `automation.spec no existe: ${normalizedSpec}.`,
            });

            continue;
        }

        if (
            !fs.statSync(
                absoluteSpec
            ).isFile()
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `automation.spec no es un archivo: ${normalizedSpec}.`,
            });

            continue;
        }

        const previousOwner =
            specOwners.get(
                normalizedSpec
            );

        if (
            previousOwner
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `El spec ${normalizedSpec} ya pertenece a ${previousOwner}.`,
            });
        } else {
            specOwners.set(
                normalizedSpec,
                scenario.id
            );
        }

        const source =
            fs.readFileSync(
                absoluteSpec,
                'utf8'
            );

        const runtimeMarker =
            automationRuntimeMarker(
                scenario
            );

        if (
            !source.includes(
                runtimeMarker
            )
        ) {
            const explanation =
                scenario
                    .automation
                    .runtime_id_template
                    ? `runtime_id_template ${runtimeMarker}`
                    : `ID ${scenario.id}`;

            problems.push({
                file:
                    entry.relativePath,

                message:
                    `El spec ${normalizedSpec} no contiene ${explanation}.`,
            });
        }
    }
}

function isCatalogIdReference(
    value: string
): boolean {
    return /^(EUV|VAL|PRE)-/.test(
        value
    );
}

function validateDependencies(
    entries:
        CatalogEntry[],
    byId:
        Map<
            string,
            CatalogEntry
        >,
    problems:
        ValidationProblem[]
): void {
    for (
        const entry
        of entries
    ) {
        for (
            const dependency
            of entry.scenario
                .preconditions
        ) {
            if (
                !isCatalogIdReference(
                    dependency
                )
            ) {
                continue;
            }

            if (
                !byId.has(
                    dependency
                )
            ) {
                problems.push({
                    file:
                        entry.relativePath,

                    message:
                        `Precondición semántica inexistente: ${dependency}.`,
                });
            }

            if (
                dependency ===
                entry.scenario.id
            ) {
                problems.push({
                    file:
                        entry.relativePath,

                    message:
                        'Un escenario no puede depender de sí mismo.',
                });
            }
        }
    }
}

function validateSuites(
    entries:
        CatalogEntry[],
    suites:
        Map<
            string,
            ParexSuite
        >,
    problems:
        ValidationProblem[]
): void {
    for (
        const entry
        of entries
    ) {
        for (
            const suiteId
            of entry.scenario
                .suites
        ) {
            if (
                !suites.has(
                    suiteId
                )
            ) {
                problems.push({
                    file:
                        entry.relativePath,

                    message:
                        `Suite inexistente: ${suiteId}.`,
                });
            }
        }
    }
}

function validateEuvSequences(
    entries:
        CatalogEntry[],
    problems:
        ValidationProblem[]
): void {
    const seen =
        new Map<
            string,
            string
        >();

    for (
        const entry
        of entries
    ) {
        const {
            scenario,
        } = entry;

        if (
            scenario.kind !==
            'euv' ||
            !scenario.use_case
        ) {
            continue;
        }

        const key =
            `${scenario.use_case.id}:${scenario.sequence}`;

        const previous =
            seen.get(
                key
            );

        if (
            previous
        ) {
            problems.push({
                file:
                    entry.relativePath,

                message:
                    `Secuencia duplicada ${scenario.sequence} dentro de ${scenario.use_case.id}. Ya pertenece a ${previous}.`,
            });

            continue;
        }

        seen.set(
            key,
            scenario.id
        );
    }
}

function automatedTestFiles():
    string[] {
    const candidateFiles =
        walkFiles(
            TESTS_DIR
        );

    return candidateFiles
        .filter(
            (filePath) =>
                filePath.endsWith(
                    '.spec.ts'
                ) ||
                filePath.endsWith(
                    '.setup.ts'
                )
        )
        .filter(
            (filePath) => {
                const relative =
                    relativeToRoot(
                        filePath
                    );

                return (
                    relative.startsWith(
                        'tests/euv/'
                    ) ||
                    relative.startsWith(
                        'tests/validation/'
                    ) ||
                    relative ===
                    'tests/auth.setup.ts'
                );
            }
        )
        .map(
            relativeToRoot
        )
        .sort();
}

function validateAutomationCoverage(
    entries:
        CatalogEntry[],
    problems:
        ValidationProblem[]
): void {
    const catalogSpecs =
        new Set(
            entries.map(
                (entry) =>
                    normalizePath(
                        entry.scenario
                            .automation
                            .spec
                    )
            )
        );

    for (
        const testFile
        of automatedTestFiles()
    ) {
        if (
            !catalogSpecs.has(
                testFile
            )
        ) {
            problems.push({
                file:
                    testFile,

                message:
                    'Existe una automatización formal sin definición en el catálogo.',
            });
        }
    }
}

function printProblems(
    problems:
        ValidationProblem[]
): void {
    for (
        const problem
        of problems
    ) {
        const prefix =
            problem.file
                ? problem.file
                : 'catalog';

        console.error(
            `✗ ${prefix}`
        );

        console.error(
            `  ${problem.message}`
        );
    }
}

function printSuccess(
    entries:
        CatalogEntry[],
    suites:
        Map<
            string,
            ParexSuite
        >
): void {
    const semanticScenarios =
        entries.filter(
            (entry) =>
                entry.scenario
                    .coverage
                    .count_as_scenario
        );

    const preconditions =
        entries.filter(
            (entry) =>
                entry.scenario.kind ===
                'precondition'
        );

    const euvs =
        semanticScenarios.filter(
            (entry) =>
                entry.scenario.kind ===
                'euv'
        );

    const validations =
        semanticScenarios.filter(
            (entry) =>
                entry.scenario.kind ===
                'validation'
        );

    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ' PAREX · Catálogo'
    );
    console.log(
        '=========================================='
    );
    console.log(
        `Definitions   : ${entries.length}`
    );
    console.log(
        `Scenarios     : ${semanticScenarios.length}`
    );
    console.log(
        `EUV           : ${euvs.length}`
    );
    console.log(
        `Validations   : ${validations.length}`
    );
    console.log(
        `Preconditions : ${preconditions.length}`
    );
    console.log(
        `Suites        : ${suites.size}`
    );
    console.log(
        'Status        : VALID'
    );
    console.log(
        '=========================================='
    );
    console.log('');
}

function main(): void {
    const problems:
        ValidationProblem[] =
        [];

    if (
        !fs.existsSync(
            SCHEMA_PATH
        )
    ) {
        console.error(
            `No existe el schema: ${relativeToRoot(
                SCHEMA_PATH
            )}`
        );

        process.exit(1);
    }

    const schema =
        readJsonFile<object>(
            SCHEMA_PATH
        );

    const ajv =
        new Ajv2020({
            allErrors: true,
            strict: true,
        });

    const validator =
        ajv.compile(
            schema
        );

    const suites =
        loadSuites(
            problems
        );

    const entries =
        loadScenarios(
            validator,
            problems
        );

    const byId =
        validateScenarioIds(
            entries,
            problems
        );

    validateAutomationSpecs(
        entries,
        problems
    );

    validateDependencies(
        entries,
        byId,
        problems
    );

    validateSuites(
        entries,
        suites,
        problems
    );

    validateEuvSequences(
        entries,
        problems
    );

    validateAutomationCoverage(
        entries,
        problems
    );

    if (
        problems.length >
        0
    ) {
        console.error('');
        console.error(
            '=========================================='
        );
        console.error(
            ' PAREX · Catálogo'
        );
        console.error(
            '=========================================='
        );
        console.error(
            'Status   : INVALID'
        );
        console.error(
            `Problems : ${problems.length}`
        );
        console.error(
            '=========================================='
        );
        console.error('');

        printProblems(
            problems
        );

        console.error('');

        process.exit(1);
    }

    printSuccess(
        entries,
        suites
    );
}

main();