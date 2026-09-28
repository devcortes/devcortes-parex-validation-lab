import fs from 'node:fs';
import path from 'node:path';
import {
    spawnSync,
} from 'node:child_process';

import {
    checkbox,
    confirm,
    select,
} from '@inquirer/prompts';

import YAML from 'yaml';

const ROOT =
    process.cwd();

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

type Environment =
    | 'dev'
    | 'pro';

type SelectionMode =
    | 'one'
    | 'many'
    | 'use-case'
    | 'suite'
    | 'tag'
    | 'all';

interface ParexScenario {
    id: string;

    name: string;

    kind:
    | 'euv'
    | 'validation'
    | 'precondition';

    status: string;

    environment: {
        allowed:
        Environment[];

        default:
        Environment;
    };

    use_case?: {
        id: string;
        name: string;
    };

    capability?: string;

    risk: {
        level:
        | 'low'
        | 'medium'
        | 'high'
        | 'critical';

        description:
        string;
    };

    coverage: {
        count_as_scenario:
        boolean;
    };

    automation: {
        project:
        string;

        spec:
        string;
    };

    tags:
    string[];

    suites:
    string[];

    sequence:
    number;
}

interface ParexSuite {
    id: string;

    name: string;

    description: string;

    execution: {
        order: number;
    };
}

function normalizePath(
    value: string
): string {
    return value.replace(
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
    ParexScenario[] {
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
            (filePath) =>
                readYaml<ParexScenario>(
                    filePath
                )
        )
        .filter(
            (scenario) =>
                scenario
                    .coverage
                    .count_as_scenario
        )
        .sort(
            compareScenarios
        );
}

function loadSuites():
    ParexSuite[] {
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
    const aContext =
        a.use_case?.id ??
        a.capability ??
        '';

    const bContext =
        b.use_case?.id ??
        b.capability ??
        '';

    const context =
        aContext.localeCompare(
            bContext
        );

    if (
        context !== 0
    ) {
        return context;
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

function contextLabel(
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

function scenarioDescription(
    scenario:
        ParexScenario
): string {
    return [
        contextLabel(
            scenario
        ),

        scenario.risk.level
            .toUpperCase(),

        scenario.kind
            .toUpperCase(),
    ].join(
        ' · '
    );
}

function scenariosForEnvironment(
    scenarios:
        ParexScenario[],
    environment:
        Environment
): ParexScenario[] {
    return scenarios.filter(
        (scenario) =>
            scenario
                .environment
                .allowed
                .includes(
                    environment
                )
    );
}

function availableUseCases(
    scenarios:
        ParexScenario[]
) {
    const map =
        new Map<
            string,
            {
                id: string;
                name: string;
                count: number;
            }
        >();

    for (
        const scenario
        of scenarios
    ) {
        if (
            !scenario.use_case
        ) {
            continue;
        }

        const current =
            map.get(
                scenario.use_case.id
            );

        if (
            current
        ) {
            current.count += 1;
            continue;
        }

        map.set(
            scenario.use_case.id,
            {
                id:
                    scenario.use_case.id,

                name:
                    scenario.use_case.name,

                count:
                    1,
            }
        );
    }

    return [
        ...map.values(),
    ].sort(
        (
            a,
            b
        ) =>
            a.id.localeCompare(
                b.id
            )
    );
}

function availableTags(
    scenarios:
        ParexScenario[]
) {
    const counts =
        new Map<
            string,
            number
        >();

    for (
        const scenario
        of scenarios
    ) {
        for (
            const tag
            of scenario.tags
        ) {
            counts.set(
                tag,
                (
                    counts.get(
                        tag
                    ) ??
                    0
                ) + 1
            );
        }
    }

    return [
        ...counts.entries(),
    ].sort(
        (
            a,
            b
        ) =>
            a[0].localeCompare(
                b[0]
            )
    );
}

function selectedBySuite(
    scenarios:
        ParexScenario[],
    suite:
        string
): ParexScenario[] {
    return scenarios.filter(
        (scenario) =>
            scenario
                .suites
                .includes(
                    suite
                )
    );
}

function selectedByTag(
    scenarios:
        ParexScenario[],
    tag:
        string
): ParexScenario[] {
    return scenarios.filter(
        (scenario) =>
            scenario
                .tags
                .includes(
                    tag
                )
    );
}

function selectedByUseCase(
    scenarios:
        ParexScenario[],
    useCase:
        string
): ParexScenario[] {
    return scenarios.filter(
        (scenario) =>
            scenario
                .use_case
                ?.id ===
            useCase
    );
}

function printHeader():
    void {
    console.clear();

    console.log('');
    console.log(
        '=============================================='
    );
    console.log(
        ' PAREX Validation Lab'
    );
    console.log(
        ' Ejecución de escenarios'
    );
    console.log(
        '=============================================='
    );
    console.log('');
}

function printPlan(
    environment:
        Environment,
    scenarios:
        ParexScenario[],
    headed:
        boolean,
    dryRun:
        boolean
): void {
    console.log('');
    console.log(
        '----------------------------------------------'
    );
    console.log(
        ' Plan de ejecución'
    );
    console.log(
        '----------------------------------------------'
    );

    console.log(
        `Ambiente   : ${environment.toUpperCase()}`
    );

    console.log(
        `Modo       : ${headed
            ? 'HEADED'
            : 'HEADLESS'
        }`
    );

    console.log(
        `Ejecución  : ${dryRun
            ? 'DRY RUN'
            : 'REAL'
        }`
    );

    console.log(
        `Escenarios : ${scenarios.length}`
    );

    console.log('');

    for (
        const scenario
        of scenarios
    ) {
        console.log(
            `  ${scenario.id}`
        );

        console.log(
            `    ${scenario.name}`
        );

        console.log(
            `    ${scenarioDescription(
                scenario
            )}`
        );
    }

    console.log('');
}

function executeRunner(
    environment:
        Environment,
    scenarios:
        ParexScenario[],
    headed:
        boolean,
    dryRun:
        boolean
): number {
    const executable =
        process.platform ===
            'win32'
            ? 'npx.cmd'
            : 'npx';

    const args =
        [
            'tsx',
            'scripts/parex.ts',
            'run',

            ...scenarios.map(
                (scenario) =>
                    scenario.id
            ),

            '--env',
            environment,

            headed
                ? '--headed'
                : '--headless',
        ];

    if (
        dryRun
    ) {
        args.push(
            '--dry-run'
        );
    }

    const result =
        spawnSync(
            executable,
            args,
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

    return (
        result.status ??
        1
    );
}

async function main():
    Promise<void> {
    printHeader();

    const allScenarios =
        loadScenarios();

    const suites =
        loadSuites();

    const environment =
        await select<Environment>({
            message:
                '¿En qué ambiente quieres trabajar?',

            choices: [
                {
                    name:
                        'DEV · Desarrollo',

                    value:
                        'dev',
                },

                {
                    name:
                        'PRO · Producción',

                    value:
                        'pro',
                },
            ],
        });

    const available =
        scenariosForEnvironment(
            allScenarios,
            environment
        );

    if (
        available.length === 0
    ) {
        throw new Error(
            `No existen escenarios habilitados para ${environment.toUpperCase()}.`
        );
    }

    console.log('');
    console.log(
        `${available.length} escenario(s) disponibles para ${environment.toUpperCase()}.`
    );
    console.log('');

    const selectionMode =
        await select<SelectionMode>({
            message:
                '¿Qué quieres ejecutar?',

            choices: [
                {
                    name:
                        'Un escenario',

                    value:
                        'one',

                    description:
                        'Seleccionar una única validación.',
                },

                {
                    name:
                        'Varios escenarios',

                    value:
                        'many',

                    description:
                        'Seleccionar manualmente varias validaciones.',
                },

                {
                    name:
                        'Un caso de uso',

                    value:
                        'use-case',

                    description:
                        'Ejecutar los escenarios disponibles de un UC.',
                },

                {
                    name:
                        'Una suite',

                    value:
                        'suite',

                    description:
                        'Ejecutar un conjunto como smoke, regression, critical o signing.',
                },

                {
                    name:
                        'Una etiqueta',

                    value:
                        'tag',

                    description:
                        'Ejecutar todos los escenarios asociados a un tag.',
                },

                {
                    name:
                        'Todos los escenarios disponibles',

                    value:
                        'all',

                    description:
                        `Ejecutar toda la cobertura habilitada para ${environment.toUpperCase()}.`,
                },
            ],
        });

    let selected:
        ParexScenario[] = [];

    switch (
    selectionMode
    ) {
        case 'one': {
            const id =
                await select<string>({
                    message:
                        'Selecciona el escenario:',

                    pageSize:
                        15,

                    choices:
                        available.map(
                            (scenario) => ({
                                name:
                                    `${scenario.id} · ${scenario.name}`,

                                value:
                                    scenario.id,

                                description:
                                    scenarioDescription(
                                        scenario
                                    ),
                            })
                        ),
                });

            selected =
                available.filter(
                    (scenario) =>
                        scenario.id ===
                        id
                );

            break;
        }

        case 'many': {
            const ids =
                await checkbox<string>({
                    message:
                        'Selecciona los escenarios:',

                    pageSize:
                        15,

                    required:
                        true,

                    choices:
                        available.map(
                            (scenario) => ({
                                name:
                                    `${scenario.id} · ${scenario.name}`,

                                value:
                                    scenario.id,

                                description:
                                    scenarioDescription(
                                        scenario
                                    ),
                            })
                        ),
                });

            const selectedIds =
                new Set(
                    ids
                );

            selected =
                available.filter(
                    (scenario) =>
                        selectedIds.has(
                            scenario.id
                        )
                );

            break;
        }

        case 'use-case': {
            const useCases =
                availableUseCases(
                    available
                );

            if (
                useCases.length === 0
            ) {
                throw new Error(
                    `No existen casos de uso habilitados para ${environment.toUpperCase()}.`
                );
            }

            const useCase =
                await select<string>({
                    message:
                        'Selecciona el caso de uso:',

                    choices:
                        useCases.map(
                            (item) => ({
                                name:
                                    `${item.id} · ${item.name} (${item.count})`,

                                value:
                                    item.id,
                            })
                        ),
                });

            selected =
                selectedByUseCase(
                    available,
                    useCase
                );

            break;
        }

        case 'suite': {
            const suiteChoices =
                suites
                    .map(
                        (suite) => ({
                            suite,

                            scenarios:
                                selectedBySuite(
                                    available,
                                    suite.id
                                ),
                        })
                    )
                    .filter(
                        (item) =>
                            item.scenarios.length >
                            0
                    );

            if (
                suiteChoices.length === 0
            ) {
                throw new Error(
                    `No existen suites con escenarios disponibles para ${environment.toUpperCase()}.`
                );
            }

            const suite =
                await select<string>({
                    message:
                        'Selecciona la suite:',

                    choices:
                        suiteChoices.map(
                            (item) => ({
                                name:
                                    `${item.suite.name} (${item.scenarios.length})`,

                                value:
                                    item.suite.id,

                                description:
                                    item.suite.description,
                            })
                        ),
                });

            selected =
                selectedBySuite(
                    available,
                    suite
                );

            break;
        }

        case 'tag': {
            const tags =
                availableTags(
                    available
                );

            const tag =
                await select<string>({
                    message:
                        'Selecciona la etiqueta:',

                    pageSize:
                        15,

                    choices:
                        tags.map(
                            (
                                [
                                    value,
                                    count,
                                ]
                            ) => ({
                                name:
                                    `${value} (${count})`,

                                value,
                            })
                        ),
                });

            selected =
                selectedByTag(
                    available,
                    tag
                );

            break;
        }

        case 'all': {
            selected =
                [
                    ...available,
                ];

            break;
        }
    }

    selected.sort(
        compareScenarios
    );

    const browserMode =
        await select<
            'headless' |
            'headed'
        >({
            message:
                '¿Cómo quieres ejecutar el navegador?',

            choices: [
                {
                    name:
                        'Headless · segundo plano',

                    value:
                        'headless',

                    description:
                        'Más rápido y apropiado para ejecución automatizada.',
                },

                {
                    name:
                        'Headed · mostrar navegador',

                    value:
                        'headed',

                    description:
                        'Útil para demostración y depuración.',
                },
            ],
        });

    const dryRun =
        await confirm({
            message:
                '¿Quieres hacer únicamente un dry run sin ejecutar Playwright?',

            default:
                false,
        });

    const headed =
        browserMode ===
        'headed';

    printPlan(
        environment,
        selected,
        headed,
        dryRun
    );

    const accepted =
        await confirm({
            message:
                dryRun
                    ? '¿Mostrar este plan?'
                    : '¿Iniciar esta ejecución?',

            default:
                true,
        });

    if (
        !accepted
    ) {
        console.log('');
        console.log(
            'Ejecución cancelada.'
        );
        console.log('');

        return;
    }

    console.log('');

    const exitCode =
        executeRunner(
            environment,
            selected,
            headed,
            dryRun
        );

    process.exit(
        exitCode
    );
}

main()
    .catch(
        (
            error
        ) => {
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
    );