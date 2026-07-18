/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** OpenRouteService の API キー(任意。補助的な代替ルート取得に使用)。 */
  readonly VITE_ORS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
