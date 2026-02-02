/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Design system path aliases
declare module "$lib/*" {
  const value: unknown;
  export default value;
}

declare module "$stores/*" {
  const value: unknown;
  export default value;
}
