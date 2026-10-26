export type MonacoWorkerKind =
  | "css"
  | "editor"
  | "html"
  | "json"
  | "typescript";

/** Maps Monaco language labels to the locally bundled worker that handles them. */
export function getMonacoWorkerKind(label: string): MonacoWorkerKind {
  if (label === "json") {
    return "json";
  }
  if (label === "css" || label === "less" || label === "scss") {
    return "css";
  }
  if (label === "handlebars" || label === "html" || label === "razor") {
    return "html";
  }
  if (label === "javascript" || label === "typescript") {
    return "typescript";
  }
  return "editor";
}
