import { DEFAULT_WPS_FIELD_CONFIG } from '../src/data/wpsFieldConfig';
import { DEFAULT_WPS_ROW_TO } from '../src/data/wpsSyncDefaults';
import type { WpsSyncSourceConfig } from '../src/shared/syncTypes';

export interface InitialSourceDefinition {
  id: string;
  name: string;
  workbookName: string;
}

export const INITIAL_STORAGE_FOIL_SOURCES: InitialSourceDefinition[] = [
  { id: 'pl', name: 'PL', workbookName: 'PL2026年出入库明细-20260707.xlsx' },
  { id: 'pc_powder', name: 'PC粉箔', workbookName: 'PC粉箔2026年出入库表.xlsx' },
  { id: 'py', name: 'PY', workbookName: 'PY2026年6月入库表-20260708(1).xlsx' },
  { id: 'pk', name: 'PK', workbookName: 'PK2026入库明细-20260701.xlsx' },
  { id: 'pc', name: 'PC', workbookName: 'PC2026年出入表-20260703(3)(3).xlsx' },
];

export interface InitialManifestInput {
  appId: string;
  apiBase?: string;
  redirectUri?: string;
  fileIds: Record<string, string | undefined>;
  extraSources?: InitialSourceDefinition[];
}

export interface InitialSourceManifest {
  credentials: {
    apiBase: string;
    appId: string;
    redirectUri: string;
  };
  sources: WpsSyncSourceConfig[];
}

function toSourceConfig(definition: InitialSourceDefinition, fileId: string): WpsSyncSourceConfig {
  return {
    id: definition.id,
    name: definition.name,
    enabled: true,
    fileId,
    worksheetIdStart: 1,
    worksheetIdEnd: 12,
    rowFrom: 1,
    rowTo: DEFAULT_WPS_ROW_TO,
    colFrom: 1,
    colTo: 80,
    fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
    updatedAt: '',
    updatedBy: '',
  };
}

export function buildInitialSourceManifest(input: InitialManifestInput): InitialSourceManifest {
  const definitions = [...INITIAL_STORAGE_FOIL_SOURCES, ...(input.extraSources || [])];
  const sources = definitions.map(definition => {
    const fileId = input.fileIds[definition.id]?.trim();
    if (!fileId) {
      throw new Error(`Missing File ID for ${definition.id} (${definition.workbookName}).`);
    }
    return toSourceConfig(definition, fileId);
  });
  return {
    credentials: {
      apiBase: input.apiBase || 'https://openapi.wps.cn',
      appId: input.appId,
      redirectUri: input.redirectUri || '',
    },
    sources,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const appId = process.env.STORAGE_FOIL_WPS_APP_ID || '';
  const redirectUri = process.env.STORAGE_FOIL_WPS_REDIRECT_URI || '';
  const fileIds = Object.fromEntries(
    process.argv.slice(2).map(pair => {
      const [key, ...rest] = pair.split('=');
      return [key, rest.join('=')];
    }),
  );
  console.log(JSON.stringify(buildInitialSourceManifest({ appId, redirectUri, fileIds }), null, 2));
}
