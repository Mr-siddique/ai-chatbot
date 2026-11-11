/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path for API calls. Defaults to "/api" (same-origin proxy). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
