/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  // The port to run the dev server
  VITE_APP_PORT: string;

  // set to true to disable the prevent unload dialog
  VITE_APP_DISABLE_PREVENT_UNLOAD: string;

  // To enable bounding box for text containers
  VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: string;

  MODE: string;

  DEV: string;
  PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
