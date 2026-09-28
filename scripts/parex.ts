import fs from 'node:fs';
import path from 'node:path';
import {
    spawnSync,
} from 'node:child_process';

import YAML from 'yaml';

const ROOT = process.cwd();

const CATALOG_DIR =
    path.join(
        ROOT,
        'catalog'
    );

const SUITES_DIR =
    path.join(
        CATALOG_DIR,
        'suites'
    );

const RESULT_FILE =
    path.join(
        ROOT,
        'test-results',
        'parex-results.json'
    );

type Environment =
    | 'dev'
    | 'pro';

type ScenarioKind =
    | 'euv'
    | 'validation'
    | 'precondition';

interface ParexEnvironment {
    allowed: Environment[];
    default: Environment;
}

interface ParexUseCase {
    id: string;
    name: string;
}

interface ParexScenarioText {
    given: string[];
    when: string[];
    then: string[];
}

interface ParexRisk {
    level:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical';

    description: string;
}

interface ParexCoverage {
    count_as_scenario: boolean;
}

interface ParexAutomation {
    framework: string;
    project: string;
    spec: string;
    runtime_id_template?: string;
}

interface ParexScenario {
    schema_version: number;

    id: string;

    name: string;

    kind: ScenarioKind;

    status: string;

    environment:
    ParexEnvironment;

    use_case?:
    ParexUseCase;

    capability?:
    string;

    objective:
    string;

    scenario:
    ParexScenarioText;

    risk:
    ParexRisk;

    coverage:
    ParexCoverage;

    automation:
    ParexAutomation;

    preconditions:
    string[];

    testability_contract:
    string[];

    evidence:
    string[];

    tags:
    string[];

    suites:
    string[];

    architecture:
    string[];

    sequence:
    number;
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

    scenario:
    ParexScenario;
}

interface CliOptions {
    command:
    string;

    ids:
    string[];

    environment:
    Environment;

    headed:
    boolean;

    dryRun:
    boolean;

    all:
    boolean;

    uc?:
    string;

    suite?:
    string;

    tag?:
    string;

    kind?:
    ScenarioKind;
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

function readYaml<T>(
    filePath: string
): T {
    return YAML.parse(
        fs.readFileSync(
            filePath,
            'utf8'
        )
    ) as T;
}

function loadScenarios():
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
        .map(
            (
                filePath
            ): CatalogEntry => ({
                filePath,

                scenario:
                    readYaml<ParexScenario>(
                        filePath
                    ),
            })
        )
        .sort(
            (
                a,
                b
            ) =>
                compareScenarios(
                    a.scenario,
                    b.scenario
                )
        );
}

function loadSuites():
    ParexSuite[] {
    if (
        !fs.existsSync(
            SUITES_DIR
        )
    ) {
        return [];
    }

    return walkFiles(
        SUITES_DIR
    )
        .filter(
            (filePath) =>
                filePath.endsWith(
                    '.yaml'
                )
        )
        .map(
            (filePath) =>
                readYaml<ParexSuite>(
                    filePath
                )
        )
        .sort(
            (
                a,
                b
            ) =>
                a.execution.order -
                b.execution.order
        );
}

function compareScenarios(
    a: ParexScenario,
    b: ParexScenario
): number {
    const aUseCase =
        a.use_case?.id ??
        a.capability ??
        '';

    const bUseCase =
        b.use_case?.id ??
        b.capability ??
        '';

    const groupCompare =
        aUseCase.localeCompare(
            bUseCase
        );

    if (
        groupCompare !==
        0
    ) {
        return groupCompare;
    }

    if (
        a.sequence !==
        b.sequence
    ) {
        return (
            a.sequence -
            b.sequence
        );
    }

    return a.id.localeCompare(
        b.id
    );
}

function requireValue(
    args: string[],
    index: number,
    option: string
): string {
    const value =
        args[
        index + 1
        ];

    if (
        !value ||
        value.startsWith(
            '--'
        )
    ) {
        throw new Error(
            `${option} requiere un valor.`
        );
    }

    return value;
}

function parseCli():
    CliOptions {
    const args =
        process.argv.slice(
            2
        );

    const command =
        args.shift() ??
        'help';

    const options:
        CliOptions = {
        command,

        ids: [],

        environment:
            'dev',

        headed:
            false,

        dryRun:
            false,

        all:
            false,
    };

    for (
        let i = 0;
        i < args.length;
        i += 1
    ) {
        const arg =
            args[i];

        switch (
        arg
        ) {
            case '--env': {
                const value =
                    requireValue(
                        args,
                        i,
                        '--env'
                    );

                if (
                    value !==
                    'dev' &&
                    value !==
                    'pro'
                ) {
                    throw new Error(
                        `Ambiente no soportado: ${value}.`
                    );
                }

                options.environment =
                    value;

                i += 1;

                break;
            }

            case '--uc': {
                options.uc =
                    requireValue(
                        args,
                        i,
                        '--uc'
                    );

                i += 1;

                break;
            }

            case '--suite': {
                options.suite =
                    requireValue(
                        args,
                        i,
                        '--suite'
                    );

                i += 1;

                break;
            }

            case '--tag': {
                options.tag =
                    requireValue(
                        args,
                        i,
                        '--tag'
                    );

                i += 1;

                break;
            }

            case '--kind': {
                const value =
                    requireValue(
                        args,
                        i,
                        '--kind'
                    );

                if (
                    value !==
                    'euv' &&
                    value !==
                    'validation' &&
                    value !==
                    'precondition'
                ) {
                    throw new Error(
                        `Tipo no soportado: ${value}.`
                    );
                }

                options.kind =
                    value;

                i += 1;

                break;
            }

            case '--headed': {
                options.headed =
                    true;

                break;
            }

            case '--headless': {
                options.headed =
                    false;

                break;
            }

            case '--dry-run': {
                options.dryRun =
                    true;

                break;
            }

            case '--all': {
                options.all =
                    true;

                break;
            }

            case '--help':
            case '-h': {
                options.command =
                    'help';

                break;
            }

            default: {
                if (
                    arg.startsWith(
                        '--'
                    )
                ) {
                    throw new Error(
                        `Opción desconocida: ${arg}.`
                    );
                }

                options.ids.push(
                    arg
                );
            }
        }
    }

    return options;
}

function scenarioContext(
    scenario:
        ParexScenario
): string {
    if (
        scenario.use_case
    ) {
        return (
            `${scenario.use_case.id} · ` +
            scenario.use_case.name
        );
    }

    switch (
    scenario.capability
    ) {
        case 'authentication':
            return 'Autenticación';

        case 'registration':
            return 'Registro';

        default:
            return (
                scenario.capability ??
                '-'
            );
    }
}

function riskLabel(
    level:
        ParexRisk['level']
): string {
    return level.toUpperCase();
}

function printHeader(
    title: string
): void {
    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ` PAREX · ${title}`
    );
    console.log(
        '=========================================='
    );
}

function printHelp(): void {
    printHeader(
        'Semantic Runner'
    );

    console.log(`
Uso:

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

Opciones:

  --env dev|pro
  --headed
  --headless
  --dry-run

Filtros de list:

  --uc UC3
  --suite signing
  --tag security
  --kind euv|validation|precondition
`);

    console.log(
        'Modo por defecto: headless'
    );

    console.log('');
}

function filterForList(
    scenarios:
        ParexScenario[],
    options:
        CliOptions
): ParexScenario[] {
    return scenarios.filter(
        (scenario) => {
            if (
                options.uc &&
                scenario
                    .use_case
                    ?.id !==
                options.uc
            ) {
                return false;
            }

            if (
                options.suite &&
                !scenario
                    .suites
                    .includes(
                        options.suite
                    )
            ) {
                return false;
            }

            if (
                options.tag &&
                !scenario
                    .tags
                    .includes(
                        options.tag
                    )
            ) {
                return false;
            }

            if (
                options.kind &&
                scenario.kind !==
                options.kind
            ) {
                return false;
            }

            return true;
        }
    );
}

function printList(
    scenarios:
        ParexScenario[],
    options:
        CliOptions
): void {
    const filtered =
        filterForList(
            scenarios,
            options
        );

    printHeader(
        'Catálogo'
    );

    if (
        filtered.length ===
        0
    ) {
        console.log(
            'No hay escenarios que coincidan con los filtros.'
        );

        console.log('');

        return;
    }

    for (
        const scenario
        of filtered
    ) {
        const functional =
            scenario
                .coverage
                .count_as_scenario
                ? 'SCENARIO'
                : 'PRECONDITION';

        console.log(
            `${scenario.id}`
        );

        console.log(
            `  ${scenario.name}`
        );

        console.log(
            `  ${scenarioContext(
                scenario
            )}`
        );

        console.log(
            `  ${functional} · ${scenario.kind.toUpperCase()} · ${riskLabel(
                scenario.risk.level
            )}`
        );

        if (
            scenario.suites
                .length >
            0
        ) {
            console.log(
                `  suites: ${scenario.suites.join(
                    ', '
                )}`
            );
        }

        console.log('');
    }

    console.log(
        `Total: ${filtered.length}`
    );

    console.log('');
}

function printSteps(
    title: string,
    values:
        string[]
): void {
    console.log(
        title
    );

    for (
        const value
        of values
    ) {
        console.log(
            `  - ${value}`
        );
    }

    console.log('');
}

function explainScenario(
    scenario:
        ParexScenario
): void {
    printHeader(
        scenario.id
    );

    console.log(
        scenario.name
    );

    console.log('');

    console.log(
        `Tipo      : ${scenario.kind}`
    );

    console.log(
        `Contexto  : ${scenarioContext(
            scenario
        )}`
    );

    console.log(
        `Riesgo    : ${riskLabel(
            scenario.risk.level
        )}`
    );

    console.log(
        `Estado    : ${scenario.status}`
    );

    console.log(
        `Ambientes : ${scenario.environment.allowed.join(
            ', '
        )}`
    );

    console.log('');

    console.log(
        'OBJETIVO'
    );

    console.log(
        scenario.objective
    );

    console.log('');

    printSteps(
        'DADO',
        scenario.scenario
            .given
    );

    printSteps(
        'CUANDO',
        scenario.scenario
            .when
    );

    printSteps(
        'ENTONCES',
        scenario.scenario
            .then
    );

    console.log(
        'RIESGO CUBIERTO'
    );

    console.log(
        scenario.risk
            .description
    );

    console.log('');

    if (
        scenario.preconditions
            .length >
        0
    ) {
        printSteps(
            'PRECONDICIONES',
            scenario.preconditions
        );
    }

    if (
        scenario.architecture
            .length >
        0
    ) {
        printSteps(
            'ARQUITECTURA',
            scenario.architecture
        );
    }

    console.log(
        'AUTOMATIZACIÓN'
    );

    console.log(
        `  framework : ${scenario.automation.framework}`
    );

    console.log(
        `  project   : ${scenario.automation.project}`
    );

    console.log(
        `  spec      : ${scenario.automation.spec}`
    );

    console.log('');

    console.log(
        `Suites : ${scenario.suites.length >
            0
            ? scenario.suites.join(
                ', '
            )
            : '-'
        }`
    );

    console.log(
        `Tags   : ${scenario.tags.join(
            ', '
        )}`
    );

    console.log('');
}

function semanticSelectorCount(
    options:
        CliOptions
): number {
    return [
        Boolean(
            options.uc
        ),
        Boolean(
            options.suite
        ),
        Boolean(
            options.tag
        ),
        options.all,
    ].filter(
        Boolean
    ).length;
}

function selectForRun(
    scenarios:
        ParexScenario[],
    options:
        CliOptions
): ParexScenario[] {
    const byId =
        new Map(
            scenarios.map(
                (
                    scenario
                ) => [
                        scenario.id,
                        scenario,
                    ]
            )
        );

    if (
        options.ids.length >
        0 &&
        semanticSelectorCount(
            options
        ) >
        0
    ) {
        throw new Error(
            'No combines IDs explícitos con --uc, --suite, --tag o --all.'
        );
    }

    if (
        options.ids.length >
        0
    ) {
        const selected:
            ParexScenario[] =
            [];

        for (
            const id
            of options.ids
        ) {
            const scenario =
                byId.get(
                    id
                );

            if (
                !scenario
            ) {
                throw new Error(
                    `No existe el escenario ${id}.`
                );
            }

            selected.push(
                scenario
            );
        }

        return selected.sort(
            compareScenarios
        );
    }

    if (
        semanticSelectorCount(
            options
        ) >
        1
    ) {
        throw new Error(
            'Utiliza únicamente uno de --uc, --suite, --tag o --all.'
        );
    }

    let selected:
        ParexScenario[];

    if (
        options.uc
    ) {
        selected =
            scenarios.filter(
                (scenario) =>
                    scenario
                        .use_case
                        ?.id ===
                    options.uc
            );
    } else if (
        options.suite
    ) {
        selected =
            scenarios.filter(
                (scenario) =>
                    scenario
                        .suites
                        .includes(
                            options.suite!
                        )
            );
    } else if (
        options.tag
    ) {
        selected =
            scenarios.filter(
                (scenario) =>
                    scenario
                        .tags
                        .includes(
                            options.tag!
                        )
            );
    } else if (
        options.all
    ) {
        selected =
            scenarios.filter(
                (scenario) =>
                    scenario
                        .coverage
                        .count_as_scenario
            );
    } else {
        throw new Error(
            'Debes indicar uno o más IDs, --uc, --suite, --tag o --all.'
        );
    }

    if (
        selected.length ===
        0
    ) {
        throw new Error(
            'La selección no produjo escenarios.'
        );
    }

    return selected.sort(
        compareScenarios
    );
}

function validateEnvironment(
    selected:
        ParexScenario[],
    environment:
        Environment
): void {
    const unsupported =
        selected.filter(
            (scenario) =>
                !scenario
                    .environment
                    .allowed
                    .includes(
                        environment
                    )
        );

    if (
        unsupported.length ===
        0
    ) {
        return;
    }

    const detail =
        unsupported
            .map(
                (scenario) =>
                    `${scenario.id} [${scenario.environment.allowed.join(
                        ', '
                    )}]`
            )
            .join(
                ', '
            );

    throw new Error(
        `Los siguientes escenarios no permiten ${environment.toUpperCase()}: ${detail}`
    );
}

function uniqueSpecs(
    selected:
        ParexScenario[]
): string[] {
    return [
        ...new Set(
            selected.map(
                (scenario) =>
                    normalizePath(
                        scenario
                            .automation
                            .spec
                    )
            )
        ),
    ];
}

function validateCatalogBeforeRun():
    void {
    const executable =
        process.platform ===
            'win32'
            ? 'npx.cmd'
            : 'npx';

    console.log(
        'Validando catálogo...'
    );

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
            'El catálogo PAREX no es válido. La ejecución fue cancelada.'
        );
    }
}

function printSelection(
    selected:
        ParexScenario[],
    options:
        CliOptions
): void {
    printHeader(
        'Run Plan'
    );

    console.log(
        `Ambiente  : ${options.environment.toUpperCase()}`
    );

    console.log(
        `Modo      : ${options.headed
            ? 'HEADED'
            : 'HEADLESS'
        }`
    );

    console.log(
        `Escenarios: ${selected.length}`
    );

    console.log('');

    for (
        const scenario
        of selected
    ) {
        console.log(
            `  ${scenario.id}`
        );

        console.log(
            `    ${scenario.name}`
        );
    }

    console.log('');
}

function runPlaywright(
    selected:
        ParexScenario[],
    options:
        CliOptions
): number {
    const specs =
        uniqueSpecs(
            selected
        );

    if (
        options.dryRun
    ) {
        console.log(
            'DRY RUN · No se ejecutó Playwright.'
        );

        console.log('');

        console.log(
            'Specs resueltos:'
        );

        for (
            const spec
            of specs
        ) {
            console.log(
                `  - ${spec}`
            );
        }

        console.log('');

        return 0;
    }

    fs.rmSync(
        RESULT_FILE,
        {
            force:
                true,
        }
    );

    const executable =
        process.platform ===
            'win32'
            ? 'npx.cmd'
            : 'npx';

    const args =
        [
            'playwright',
            'test',
            ...specs,
            '--workers=1',
        ];

    if (
        options.headed
    ) {
        args.push(
            '--headed'
        );
    }

    const env = {
        ...process.env,

        TEST_ENV:
            options.environment,
    };

    const result =
        spawnSync(
            executable,
            args,
            {
                cwd:
                    ROOT,

                env,

                stdio:
                    'inherit',

                shell:
                    process.platform ===
                    'win32',
            }
        );

    const exitCode =
        result.status ??
        1;

    let persisted =
        false;

    if (
        fs.existsSync(
            RESULT_FILE
        )
    ) {
        console.log('');
        console.log(
            'Persistiendo resultados PAREX...'
        );
        console.log('');

        const ingest =
            spawnSync(
                executable,
                [
                    'tsx',
                    'scripts/ingest-results.ts',
                ],
                {
                    cwd:
                        ROOT,

                    env,

                    stdio:
                        'inherit',

                    shell:
                        process.platform ===
                        'win32',
                }
            );

        persisted =
            ingest.status ===
            0;
    }

    printHeader(
        'Run Completed'
    );

    console.log(
        `Ambiente    : ${options.environment.toUpperCase()}`
    );

    console.log(
        `Escenarios  : ${selected.length}`
    );

    console.log(
        `Playwright  : ${exitCode === 0
            ? 'SUCCESS'
            : `EXIT ${exitCode}`
        }`
    );

    console.log(
        `Persistencia: ${persisted
            ? 'OK'
            : 'NO'
        }`
    );

    console.log('');

    return exitCode;
}

function main(): void {
    try {
        const options =
            parseCli();

        const entries =
            loadScenarios();

        const scenarios =
            entries.map(
                (entry) =>
                    entry.scenario
            );

        const suites =
            loadSuites();

        switch (
        options.command
        ) {
            case 'help': {
                printHelp();

                return;
            }

            case 'list': {
                printList(
                    scenarios,
                    options
                );

                return;
            }

            case 'suites': {
                printHeader(
                    'Suites'
                );

                for (
                    const suite
                    of suites
                ) {
                    console.log(
                        `${suite.id} · ${suite.name}`
                    );

                    console.log(
                        `  ${suite.description}`
                    );

                    console.log('');
                }

                return;
            }

            case 'explain': {
                const id =
                    options.ids[0];

                if (
                    !id
                ) {
                    throw new Error(
                        'Uso: parex explain <ID>'
                    );
                }

                const scenario =
                    scenarios.find(
                        (candidate) =>
                            candidate.id ===
                            id
                    );

                if (
                    !scenario
                ) {
                    throw new Error(
                        `No existe el escenario ${id}.`
                    );
                }

                explainScenario(
                    scenario
                );

                return;
            }

            case 'run': {
                const selected =
                    selectForRun(
                        scenarios,
                        options
                    );

                validateEnvironment(
                    selected,
                    options.environment
                );

                validateCatalogBeforeRun();

                printSelection(
                    selected,
                    options
                );

                const exitCode =
                    runPlaywright(
                        selected,
                        options
                    );

                process.exit(
                    exitCode
                );
            }

            default: {
                throw new Error(
                    `Comando desconocido: ${options.command}. Usa "npm run parex -- help".`
                );
            }
        }
    } catch (
    error
    ) {
        console.error('');

        console.error(
            'PAREX ERROR'
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
}

main();