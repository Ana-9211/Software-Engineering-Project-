// Validates docs/phase-2/design/openapi.yaml against the OpenAPI 3 schema (VFR-15).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { Validator } from '@seriousme/openapi-schema-validator';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/phase-2/design/openapi.yaml');
const result = await new Validator().validate(yaml.load(readFileSync(file, 'utf8')));
if (!result.valid) {
  process.stderr.write(`OpenAPI document is invalid: ${JSON.stringify(result.errors)}\n`);
  process.exit(1);
}
process.stdout.write('OpenAPI document is valid\n');
