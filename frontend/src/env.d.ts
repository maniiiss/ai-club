/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_PORT?: string
  readonly VITE_PUBLIC_FRONTEND_BASE_URL?: string
  readonly VITE_PUBLIC_FRONTEND_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
