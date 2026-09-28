import fs from 'node:fs';
import path from 'node:path';

import {
    spawnSync,
} from 'node:child_process';

import {
    createInterface,
    type Interface,
} from 'node:readline/promises';

import {
    stdin as input,
    stdout as output,
} from 'node:process';

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
        allowed: Environment[];

        default: Environment;
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

        description: string;
    };

    coverage: {
        count_as_scenario:
        boolean;
    };

    automation: {
        project: string;

        spec: string;
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

interface Choice<T> {
    label: string;

    value: T;

    description?: string;
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

    const contextCompare =
        aContext.localeCompare(
            bContext
        );

    if (
        contextCompare !== 0
    ) {
        return contextCompare;
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
            (filePath) =>
                !normalizePath(
                    filePath
                ).includes(
                    '/catalog/suites/'
                )
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

function availableUseCases(
    scenarios:
        ParexScenario[]
) {
    const values =
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

        const existing =
            values.get(
                scenario.use_case.id
            );

        if (
            existing
        ) {
            existing.count += 1;

            continue;
        }

        values.set(
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
        ...values.values(),
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
    const values =
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
            values.set(
                tag,
                (
                    values.get(
                        tag
                    ) ??
                    0
                ) + 1
            );
        }
    }

    return [
        ...values.entries(),
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

function printHeader():
    void {
    console.log('');
    console.log(
        '=============================================='
    );
    console.log(
        ' PAREX Validation Lab'
    );
    console.log(
        ' Ejecución de validaciones'
    );
    console.log(
        '=============================================='
    );
    console.log('');
}

async function chooseOne<T>(
    rl: Interface,
    message: string,
    choices:
        Choice<T>[]
): Promise<T> {
    if (
        choices.length === 0
    ) {
        throw new Error(
            `No existen opciones para: ${message}`
        );
    }

    while (
        true
    ) {
        console.log('');
        console.log(
            message
        );
        console.log('');

        choices.forEach(
            (
                choice,
                index
            ) => {
                console.log(
                    `  ${index + 1}. ${choice.label}`
                );

                if (
                    choice.description
                ) {
                    console.log(
                        `     ${choice.description}`
                    );
                }
            }
        );

        console.log('');

        const answer =
            (
                await rl.question(
                    `Selecciona [1-${choices.length}]: `
                )
            ).trim();

        const index =
            Number(
                answer
            ) - 1;

        if (
            Number.isInteger(
                index
            ) &&
            index >= 0 &&
            index < choices.length
        ) {
            return choices[
                index
            ].value;
        }

        console.log('');
        console.log(
            'Opción inválida. Intenta nuevamente.'
        );
    }
}

function parseSelectionToken(
    token: string,
    max:
        number
): number[] {
    const trimmed =
        token.trim();

    if (
        !trimmed
    ) {
        return [];
    }

    if (
        trimmed.includes(
            '-'
        )
    ) {
        const parts =
            trimmed.split(
                '-'
            );

        if (
            parts.length !== 2
        ) {
            return [];
        }

        const start =
            Number(
                parts[0]
            );

        const end =
            Number(
                parts[1]
            );

        if (
            !Number.isInteger(
                start
            ) ||
            !Number.isInteger(
                end
            ) ||
            start < 1 ||
            end < start ||
            end > max
        ) {
            return [];
        }

        const values:
            number[] = [];

        for (
            let value = start;
            value <= end;
            value += 1
        ) {
            values.push(
                value
            );
        }

        return values;
    }

    const value =
        Number(
            trimmed
        );

    if (
        !Number.isInteger(
            value
        ) ||
        value < 1 ||
        value > max
    ) {
        return [];
    }

    return [
        value,
    ];
}

async function chooseMany<T>(
    rl: Interface,
    message: string,
    choices:
        Choice<T>[]
): Promise<T[]> {
    while (
        true
    ) {
        console.log('');
        console.log(
            message
        );
        console.log('');

        choices.forEach(
            (
                choice,
                index
            ) => {
                console.log(
                    `  ${index + 1}. ${choice.label}`
                );

                if (
                    choice.description
                ) {
                    console.log(
                        `     ${choice.description}`
                    );
                }
            }
        );

        console.log('');
        console.log(
            'Puedes usar comas o rangos.'
        );
        console.log(
            'Ejemplo: 4,6,8-10'
        );
        console.log('');

        const answer =
            (
                await rl.question(
                    'Selecciona: '
                )
            ).trim();

        const tokens =
            answer.split(
                ','
            );

        const indexes =
            new Set<
                number
            >();

        let valid =
            true;

        for (
            const token
            of tokens
        ) {
            const values =
                parseSelectionToken(
                    token,
                    choices.length
                );

            if (
                values.length === 0
            ) {
                valid =
                    false;

                break;
            }

            for (
                const value
                of values
            ) {
                indexes.add(
                    value - 1
                );
            }
        }

        if (
            valid &&
            indexes.size > 0
        ) {
            return [
                ...indexes,
            ]
                .sort(
                    (
                        a,
                        b
                    ) =>
                        a - b
                )
                .map(
                    (index) =>
                        choices[
                            index
                        ].value
                );
        }

        console.log('');
        console.log(
            'Selección inválida. Intenta nuevamente.'
        );
    }
}

async function confirm(
    rl: Interface,
    message: string,
    defaultValue:
        boolean
): Promise<boolean> {
    const suffix =
        defaultValue
            ? '[S/n]'
            : '[s/N]';

    while (
        true
    ) {
        const answer =
            (
                await rl.question(
                    `${message} ${suffix}: `
                )
            )
                .trim()
                .toLowerCase();

        if (
            !answer
        ) {
            return defaultValue;
        }

        if (
            answer === 's' ||
            answer === 'si' ||
            answer === 'sí' ||
            answer === 'y' ||
            answer === 'yes'
        ) {
            return true;
        }

        if (
            answer === 'n' ||
            answer === 'no'
        ) {
            return false;
        }

        console.log(
            'Responde S o N.'
        );
    }
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
        `Navegador  : ${headed
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

    const rl =
        createInterface({
            input,
            output,
        });

    try {
        const allScenarios =
            loadScenarios();

        const suites =
            loadSuites();

        const environment =
            await chooseOne<
                Environment
            >(
                rl,

                '¿En qué ambiente quieres trabajar?',

                [
                    {
                        label:
                            'DEV · Desarrollo',

                        value:
                            'dev',
                    },

                    {
                        label:
                            'PRO · Producción',

                        value:
                            'pro',
                    },
                ]
            );

        const available =
            scenariosForEnvironment(
                allScenarios,
                environment
            );

        console.log('');
        console.log(
            `${available.length} escenario(s) disponibles para ${environment.toUpperCase()}.`
        );

        const selectionMode =
            await chooseOne<
                SelectionMode
            >(
                rl,

                '¿Qué quieres ejecutar?',

                [
                    {
                        label:
                            'Un escenario',

                        value:
                            'one',
                    },

                    {
                        label:
                            'Varios escenarios',

                        value:
                            'many',
                    },

                    {
                        label:
                            'Un caso de uso',

                        value:
                            'use-case',
                    },

                    {
                        label:
                            'Una suite',

                        value:
                            'suite',
                    },

                    {
                        label:
                            'Una etiqueta',

                        value:
                            'tag',
                    },

                    {
                        label:
                            'Todos los escenarios disponibles',

                        value:
                            'all',
                    },
                ]
            );

        let selected:
            ParexScenario[] = [];

        switch (
        selectionMode
        ) {
            case 'one': {
                const scenarioId =
                    await chooseOne<string>(
                        rl,

                        'Selecciona el escenario:',

                        available.map(
                            (scenario) => ({
                                label:
                                    `${scenario.id} · ${scenario.name}`,

                                value:
                                    scenario.id,

                                description:
                                    scenarioDescription(
                                        scenario
                                    ),
                            })
                        )
                    );

                selected =
                    available.filter(
                        (scenario) =>
                            scenario.id ===
                            scenarioId
                    );

                break;
            }

            case 'many': {
                const ids =
                    await chooseMany<string>(
                        rl,

                        'Selecciona los escenarios:',

                        available.map(
                            (scenario) => ({
                                label:
                                    `${scenario.id} · ${scenario.name}`,

                                value:
                                    scenario.id,

                                description:
                                    scenarioDescription(
                                        scenario
                                    ),
                            })
                        )
                    );

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

                const useCase =
                    await chooseOne<string>(
                        rl,

                        'Selecciona el caso de uso:',

                        useCases.map(
                            (item) => ({
                                label:
                                    `${item.id} · ${item.name} (${item.count})`,

                                value:
                                    item.id,
                            })
                        )
                    );

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

                const suiteId =
                    await chooseOne<string>(
                        rl,

                        'Selecciona la suite:',

                        suiteChoices.map(
                            (item) => ({
                                label:
                                    `${item.suite.name} (${item.scenarios.length})`,

                                value:
                                    item.suite.id,

                                description:
                                    item.suite.description,
                            })
                        )
                    );

                selected =
                    selectedBySuite(
                        available,
                        suiteId
                    );

                break;
            }

            case 'tag': {
                const tags =
                    availableTags(
                        available
                    );

                const tag =
                    await chooseOne<string>(
                        rl,

                        'Selecciona la etiqueta:',

                        tags.map(
                            (
                                [
                                    value,
                                    count,
                                ]
                            ) => ({
                                label:
                                    `${value} (${count})`,

                                value,
                            })
                        )
                    );

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
            await chooseOne<
                'headless' |
                'headed'
            >(
                rl,

                '¿Cómo quieres ejecutar el navegador?',

                [
                    {
                        label:
                            'Headless · segundo plano',

                        value:
                            'headless',
                    },

                    {
                        label:
                            'Headed · mostrar navegador',

                        value:
                            'headed',
                    },
                ]
            );

        /*
         * En el menú interactivo dejamos dry run como opción
         * predeterminada para evitar iniciar accidentalmente una
         * ejecución real.
         */
        const dryRun =
            await confirm(
                rl,
                '¿Hacer únicamente un dry run?',
                true
            );

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
            await confirm(
                rl,

                dryRun
                    ? '¿Continuar con el dry run?'
                    : '¿Iniciar la ejecución real?',

                true
            );

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

        rl.close();

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
    } finally {
        rl.close();
    }
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