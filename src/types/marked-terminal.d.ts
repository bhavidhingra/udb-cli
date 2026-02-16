declare module "marked-terminal" {
  import { MarkedExtension } from "marked";

  interface TerminalRendererOptions {
    reflowText?: boolean;
    width?: number;
    code?: (s: string) => string;
    blockquote?: (s: string) => string;
    html?: (s: string) => string;
    heading?: (s: string) => string;
    firstHeading?: (s: string) => string;
    hr?: (s: string) => string;
    listitem?: (s: string) => string;
    table?: (s: string) => string;
    paragraph?: (s: string) => string;
    strong?: (s: string) => string;
    em?: (s: string) => string;
    codespan?: (s: string) => string;
    del?: (s: string) => string;
    link?: (s: string) => string;
    href?: (s: string) => string;
  }

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
}
