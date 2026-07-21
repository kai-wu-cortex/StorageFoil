import { COLLECTION_NAMES } from '../src/server/collections';
import { getMongoDb, resolveMongoDbName } from '../src/server/mongodb';
import {
  STORAGE_FOIL_COLLECTION_SCHEMAS,
  STORAGE_FOIL_SCHEMA_VERSION,
} from '../src/server/schemaDefinitions';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const apply = hasFlag('--apply');
  const dryRun = hasFlag('--dry-run') || !apply;
  const dbName = resolveMongoDbName();

  console.log(`StorageFoil MongoDB schema version: ${STORAGE_FOIL_SCHEMA_VERSION}`);
  console.log(`Database: ${dbName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log('Collections:');
  for (const name of Object.values(COLLECTION_NAMES)) {
    console.log(`- ${name}`);
  }

  if (dryRun) {
    console.log('Proposed actions: create/collMod validators and create configured indexes.');
    return;
  }

  const db = await getMongoDb();
  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name),
  );

  for (const schema of STORAGE_FOIL_COLLECTION_SCHEMAS) {
    if (existingCollections.has(schema.name)) {
      await db.command({
        collMod: schema.name,
        validator: schema.validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    } else {
      await db.createCollection(schema.name, {
        validator: schema.validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }

    if (schema.indexes.length > 0) {
      const collection = db.collection(schema.name);
      for (const index of schema.indexes) {
        await collection.createIndex(index.key, index.options);
      }
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
