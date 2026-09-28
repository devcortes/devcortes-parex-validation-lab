import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = process.cwd();

const EUV_DIR =
    path.join(
        ROOT,
        'catalog',
        'euv'
    );

function walk(
    directory: string
): string[] {
    const result: string[] = [];

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
                ...walk(
                    absolute
                )
            );
        } else if (
            entry.isFile() &&
            entry.name.endsWith(
                '.yaml'
            )
        ) {
            result.push(
                absolute
            );
        }
    }

    return result;
}

const euvs =
    walk(
        EUV_DIR
    )
        .map(
            (file) =>
                YAML.parse(
                    fs.readFileSync(
                        file,
                        'utf8'
                    )
                )
        )
        .sort(
            (a, b) =>
                a.id.localeCompare(
                    b.id
                )
        );

console.log('');
console.log(
    'PAREX · Escenarios EUV'
);
console.log('');

for (
    const euv
    of euvs
) {
    console.log(
        `${euv.id} · ${euv.name}`
    );
}

console.log('');
console.log(
    `Total: ${euvs.length}`
);
console.log('');