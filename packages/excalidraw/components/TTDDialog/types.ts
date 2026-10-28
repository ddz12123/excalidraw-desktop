import type { MermaidConfig } from "@excalidraw/mermaid-to-excalidraw";

import type { MermaidToExcalidrawResult } from "@excalidraw/mermaid-to-excalidraw/dist/interfaces";

export interface MermaidToExcalidrawLibProps {
  /** loading state of the (lazy) lib. "error" e.g. while offline */
  status: "loading" | "loaded" | "error";
  /**
   * set when loading failed while online (e.g. stale app version after
   * a deploy, or the browser cached the failed fetch), i.e. only a page
   * reload will likely recover
   */
  reloadRequired?: boolean;
  api: Promise<{
    parseMermaidToExcalidraw: (
      definition: string,
      config?: MermaidConfig,
    ) => Promise<MermaidToExcalidrawResult>;
  }>;
}
