/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_SESSION_STORE_URL: string
  readonly VITE_OBJECT_STORAGE_URL: string
  readonly VITE_ATTRIBUTE_ENRICHER_URL: string
  readonly VITE_MEDIAMTX_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}