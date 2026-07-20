/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WPS_APP_ID?: string;
  readonly VITE_WPS_APP_KEY?: string;
  readonly VITE_WPS_SPREADSHEET_ID?: string;
  readonly VITE_WPS_API_BASE?: string;
  readonly VITE_WPS_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
