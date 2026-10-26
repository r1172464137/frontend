import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { getMonacoWorkerKind } from "./monaco-worker-label.js";

// Vite emits each imported worker as an application-owned build asset.
globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (getMonacoWorkerKind(label)) {
      case "css":
        return new CssWorker();
      case "html":
        return new HtmlWorker();
      case "json":
        return new JsonWorker();
      case "typescript":
        return new TypeScriptWorker();
      default:
        return new EditorWorker();
    }
  },
};

export function getMonaco() {
  return monaco;
}
