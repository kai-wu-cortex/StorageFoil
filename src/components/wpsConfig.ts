import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import type { WpsDataSource, WpsSyncConfig } from '../types';

export const WPS_CONFIG_STORAGE_KEY = 'storage_foil_wps_config';
export const WPS_FIELD_CONFIG_STORAGE_KEY = 'storage_foil_wps_field_mapping';

type WpsEnv = {
  VITE_WPS_APP_ID?: string;
  VITE_WPS_APP_KEY?: string;
  VITE_WPS_SPREADSHEET_ID?: string;
  VITE_WPS_API_BASE?: string;
  VITE_WPS_REDIRECT_URI?: string;
};

const SOURCE_NAMES = [
  ['pl', 'PL'],
  ['pc-powder', 'PC粉箔'],
  ['py', 'PY'],
  ['pk', 'PK'],
  ['pc', 'PC'],
] as const;

export function createWpsDataSource(name: string, id: string): WpsDataSource {
  return {
    id,
    name: name.trim(),
    enabled: true,
    fileId: '',
    worksheetId: 1,
    worksheetIdByMonth: {},
    worksheetIdStart: 1,
    worksheetIdEnd: 12,
  };
}

function createDefaultSources(legacy: Partial<WpsSyncConfig> = {}): WpsDataSource[] {
  return SOURCE_NAMES.map(([id, name], index) => {
    const source = createWpsDataSource(name, id);
    return {
      ...source,
      fileId: index === 0 ? legacy.fileId || '' : '',
      worksheetId: index === 0 ? legacy.worksheetId || 1 : 1,
      worksheetIdByMonth:
        index === 0 && legacy.worksheetIdByMonth
          ? legacy.worksheetIdByMonth
          : {},
    };
  });
}

export function loadWpsConfig(env: WpsEnv = import.meta.env): WpsSyncConfig {
  const defaults: WpsSyncConfig = {
    apiUrl: env.VITE_WPS_API_BASE || 'https://openapi.wps.cn',
    appId: env.VITE_WPS_APP_ID || '',
    appKey: env.VITE_WPS_APP_KEY || '',
    redirectUri:
      env.VITE_WPS_REDIRECT_URI ||
      (typeof window !== 'undefined'
        ? window.location.origin + window.location.pathname
        : ''),
    fileId: env.VITE_WPS_SPREADSHEET_ID || '',
    worksheetId: 1,
    worksheetIdByMonth: {},
    rowFrom: 0,
    rowTo: 9999,
    colFrom: 0,
    colTo: 69,
    code: '',
    fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
    sources: [],
  };

  try {
    const savedConfig = localStorage.getItem(WPS_CONFIG_STORAGE_KEY);
    const savedFields = localStorage.getItem(WPS_FIELD_CONFIG_STORAGE_KEY);
    const parsedConfig = savedConfig ? JSON.parse(savedConfig) : {};
    const parsedFields = savedFields ? JSON.parse(savedFields) : undefined;

    const sources = Array.isArray(parsedConfig.sources)
      ? parsedConfig.sources.map((source: Partial<WpsDataSource>, index: number) => ({
          ...createWpsDataSource(
            source.name || `数据源 ${index + 1}`,
            source.id || `source-${index + 1}`,
          ),
          ...source,
          worksheetIdStart: Number(source.worksheetIdStart) || 1,
          worksheetIdEnd: Number(source.worksheetIdEnd) || 12,
        }))
      : createDefaultSources({
          fileId: parsedConfig.fileId || defaults.fileId,
          worksheetId: parsedConfig.worksheetId || defaults.worksheetId,
          worksheetIdByMonth: parsedConfig.worksheetIdByMonth,
        });

    return {
      ...defaults,
      ...parsedConfig,
      appId: parsedConfig.appId || defaults.appId,
      appKey: parsedConfig.appKey || defaults.appKey,
      redirectUri: parsedConfig.redirectUri || defaults.redirectUri,
      fileId: parsedConfig.fileId || defaults.fileId,
      apiUrl: parsedConfig.apiUrl || defaults.apiUrl,
      worksheetIdByMonth:
        parsedConfig.worksheetIdByMonth &&
        typeof parsedConfig.worksheetIdByMonth === 'object'
          ? parsedConfig.worksheetIdByMonth
          : defaults.worksheetIdByMonth,
      fieldConfig: Array.isArray(parsedFields)
        ? parsedFields
        : Array.isArray(parsedConfig.fieldConfig)
          ? parsedConfig.fieldConfig
          : defaults.fieldConfig,
      sources,
    };
  } catch {
    return { ...defaults, sources: createDefaultSources(defaults) };
  }
}

export function saveWpsConfig(config: WpsSyncConfig): void {
  const { fieldConfig, ...baseConfig } = config;
  localStorage.setItem(WPS_CONFIG_STORAGE_KEY, JSON.stringify(baseConfig));
  localStorage.setItem(WPS_FIELD_CONFIG_STORAGE_KEY, JSON.stringify(fieldConfig));
}

export function isWpsConfigured(config: WpsSyncConfig): boolean {
  return Boolean(
    config.appId &&
      config.appKey &&
      config.sources.some(source => source.enabled && source.fileId),
  );
}
