import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

const ROOT =
    process.cwd();

const DEFECTS_DIR =
    path.join(
        ROOT,
        'catalog',
        'defects'
    );

const SCENARIO_DIRS = [
    path.join(
        ROOT,
        'catalog',
        'euv'
    ),

    path.join(
        ROOT,
        'catalog',
        'validation'
    ),

    path.join(
        ROOT,
        'catalog',
        'preconditions'
    ),
];

type DefectStatus =
    | 'open'
    | 'resolved';

type Severity =
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
    Severity;

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

    const result:
        string[] = [];

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
            result.push(
                ...walkFiles(
                    absolute
                )
            );

            continue;
        }

        if (
            entry.isFile()
        ) {
            result.push(
                absolute
            );
        }
    }

    return result;
}

function scenarioIds():
    Set<string> {
    const ids =
        new Set<string>();

    for (
        const directory
        of SCENARIO_DIRS
    ) {
        for (
            const filePath
            of walkFiles(
                directory
            )
        ) {
            if (
                !filePath.endsWith(
                    '.yaml'
                )
            ) {
                continue;
            }

            const parsed =
                YAML.parse(
                    fs.readFileSync(
                        filePath,
                        'utf8'
                    )
                );

            if (
                typeof parsed?.id ===
                'string'
            ) {
                ids.add(
                    parsed.id
                );
            }
        }
    }

    return ids;
}

function requiredText(
    value: unknown,
    field: string,
    file:
        string
): void {
    if (
        typeof value !==
        'string' ||
        !value.trim()
    ) {
        throw new Error(
            `${file}: ${field} es obligatorio.`
        );
    }
}

function main(): void {
    const scenarios =
        scenarioIds();

    const defectFiles =
        walkFiles(
            DEFECTS_DIR
        )
            .filter(
                (filePath) =>
                    filePath.endsWith(
                        '.yaml'
                    )
            )
            .sort();

    if (
        defectFiles.length ===
        0
    ) {
        throw new Error(
            'No existen defectos definidos.'
        );
    }

    const ids =
        new Set<string>();

    let open =
        0;

    let resolved =
        0;

    for (
        const filePath
        of defectFiles
    ) {
        const relative =
            path
                .relative(
                    ROOT,
                    filePath
                )
                .replace(
                    /\\/g,
                    '/'
                );

        const defect =
            YAML.parse(
                fs.readFileSync(
                    filePath,
                    'utf8'
                )
            ) as ParexDefect;

        requiredText(
            defect.id,
            'id',
            relative
        );

        requiredText(
            defect.title,
            'title',
            relative
        );

        requiredText(
            defect.description,
            'description',
            relative
        );

        requiredText(
            defect.impact,
            'impact',
            relative
        );

        requiredText(
            defect.root_cause,
            'root_cause',
            relative
        );

        if (
            !/^DEF-[A-Z0-9-]+$/.test(
                defect.id
            )
        ) {
            throw new Error(
                `${relative}: ID inválido ${defect.id}.`
            );
        }

        if (
            path.basename(
                filePath
            ) !==
            `${defect.id}.yaml`
        ) {
            throw new Error(
                `${relative}: el archivo debe llamarse ${defect.id}.yaml.`
            );
        }

        if (
            ids.has(
                defect.id
            )
        ) {
            throw new Error(
                `${relative}: ID duplicado ${defect.id}.`
            );
        }

        ids.add(
            defect.id
        );

        if (
            defect.status !==
            'open' &&
            defect.status !==
            'resolved'
        ) {
            throw new Error(
                `${relative}: status inválido.`
            );
        }

        if (
            ![
                'low',
                'medium',
                'high',
                'critical',
            ].includes(
                defect.severity
            )
        ) {
            throw new Error(
                `${relative}: severity inválida.`
            );
        }

        const references = [
            ...(defect.discovered_by ?? []),
            ...(defect.related_scenarios ?? []),
        ];

        for (
            const scenarioId
            of references
        ) {
            if (
                !scenarios.has(
                    scenarioId
                )
            ) {
                throw new Error(
                    `${relative}: escenario inexistente ${scenarioId}.`
                );
            }
        }

        if (
            defect.status ===
            'open'
        ) {
            open += 1;
        } else {
            resolved += 1;
        }
    }

    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        ' PAREX · Hallazgos'
    );
    console.log(
        '=========================================='
    );
    console.log(
        `Defectos  : ${defectFiles.length}`
    );
    console.log(
        `Abiertos   : ${open}`
    );
    console.log(
        `Resueltos  : ${resolved}`
    );
    console.log(
        'Estado     : VALID'
    );
    console.log(
        '=========================================='
    );
    console.log('');
}

main();