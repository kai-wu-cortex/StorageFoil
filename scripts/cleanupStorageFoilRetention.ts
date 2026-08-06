import 'dotenv/config';
import { closeMongoClient } from '../src/server/mongodb.ts';
import {
  applyStorageFoilRetention,
  inspectStorageFoilRetention,
} from '../src/server/retentionRepository.ts';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const apply = hasFlag('--apply');
  const result = apply
    ? await applyStorageFoilRetention()
    : await inspectStorageFoilRetention();
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
