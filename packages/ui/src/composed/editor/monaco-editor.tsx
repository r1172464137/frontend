"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useSize } from "ahooks";
import { EyeIcon, EyeOff, FullscreenIcon, MinimizeIcon } from "lucide-react";
import type { editor } from "monaco-editor";
import DraculaTheme from "monaco-themes/themes/Dracula.json" with {
  type: "json",
};
import { useEffect, useRef, useState } from "react";
import { getMonaco } from "./monaco-runtime.js";

const monaco = getMonaco();

export type Monaco = typeof import("monaco-editor");
export type OnMount = (
  editorInstance: editor.IStandaloneCodeEditor,
  monacoInstance: Monaco
) => void;

export interface MonacoEditorProps {
  value?: string;
  onChange?: (value: string | undefined) => void;
  onBlur?: (value: string | undefined) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  render?: (value?: string) => React.ReactNode;
  onMount?: OnMount;
  beforeMount?: (monaco: Monaco) => void;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
  readOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

interface LocalMonacoEditorProps {
  beforeMount?: (monacoInstance: Monaco) => void;
  className?: string;
  language: string;
  onBlur?: (value: string) => void;
  onChange?: (value: string) => void;
  onMount?: OnMount;
  options: editor.IStandaloneEditorConstructionOptions;
  theme: string;
  value?: string;
}

function LocalMonacoEditor({
  beforeMount,
  className,
  language,
  onBlur,
  onChange,
  onMount,
  options,
  theme,
  value,
}: LocalMonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const applyingValueRef = useRef(false);
  const beforeMountRef = useRef(beforeMount);
  const onBlurRef = useRef(onBlur);
  const onChangeRef = useRef(onChange);
  const onMountRef = useRef(onMount);
  const optionsRef = useRef(options);

  beforeMountRef.current = beforeMount;
  onBlurRef.current = onBlur;
  onChangeRef.current = onChange;
  onMountRef.current = onMount;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    beforeMountRef.current?.(monaco);
    const editorInstance = monaco.editor.create(container, {
      ...optionsRef.current,
      language,
      theme,
      value: value ?? "",
    });
    editorRef.current = editorInstance;

    const changeSubscription = editorInstance.onDidChangeModelContent(() => {
      if (!applyingValueRef.current) {
        onChangeRef.current?.(editorInstance.getValue());
      }
    });
    const blurSubscription = editorInstance.onDidBlurEditorWidget(() => {
      onBlurRef.current?.(editorInstance.getValue());
    });
    onMountRef.current?.(editorInstance, monaco);

    return () => {
      changeSubscription.dispose();
      blurSubscription.dispose();
      const model = editorInstance.getModel();
      editorInstance.dispose();
      model?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editorInstance = editorRef.current;
    if (!(editorInstance && value !== undefined)) {
      return;
    }
    if (editorInstance.getValue() === value) {
      return;
    }

    applyingValueRef.current = true;
    try {
      if (editorInstance.getOption(monaco.editor.EditorOption.readOnly)) {
        editorInstance.setValue(value);
      } else {
        const model = editorInstance.getModel();
        if (model) {
          editorInstance.executeEdits("", [
            {
              forceMoveMarkers: true,
              range: model.getFullModelRange(),
              text: value,
            },
          ]);
          editorInstance.pushUndoStop();
        }
      }
    } finally {
      applyingValueRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [language]);

  useEffect(() => {
    editorRef.current?.updateOptions(options);
  }, [options]);

  useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  return <div className={cn("size-full", className)} ref={containerRef} />;
}

export function MonacoEditor({
  value: propValue,
  onChange,
  onBlur,
  title = "Editor Title",
  description,
  placeholder = "Start typing...",
  render,
  onMount,
  beforeMount,
  language = "markdown",
  className,
  showLineNumbers = false,
  readOnly = false,
}: MonacoEditorProps) {
  const [internalValue, setInternalValue] = useState<string | undefined>(
    propValue
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);

  useEffect(() => {
    // Only update internalValue if propValue has actually changed and is different from current value
    if (propValue !== internalValue) {
      setInternalValue(propValue);
    }
  }, [propValue]);

  const debouncedOnChange = useRef(
    debounce((newValue: string | undefined) => {
      if (onChange) {
        onChange(newValue);
      }
    }, 300)
  ).current;

  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    onMount?.(editorInstance, monacoInstance);
  };

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const togglePreview = () => setIsPreviewVisible(!isPreviewVisible);

  return (
    <div className="size-full" ref={ref}>
      <div style={size}>
        <div
          className={cn(
            "flex size-full min-h-96 flex-col rounded-md border",
            className,
            {
              "!mt-0 fixed inset-0 z-50 h-screen bg-background": isFullscreen,
            }
          )}
        >
          <div className="flex items-center justify-between border-b p-2">
            <div>
              <h1 className="text-left font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {title}
              </h1>
              <p className="text-[0.8rem] text-muted-foreground">
                {description}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {render && (
                <Button
                  onClick={togglePreview}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  {isPreviewVisible ? <EyeOff /> : <EyeIcon />}
                </Button>
              )}
              <Button
                onClick={toggleFullscreen}
                size="icon"
                type="button"
                variant="outline"
              >
                {isFullscreen ? <MinimizeIcon /> : <FullscreenIcon />}
              </Button>
            </div>
          </div>

          <div className={cn("relative flex flex-1")}>
            <div
              className={cn("flex-1 overflow-auto p-4 invert dark:invert-0", {
                "w-1/2": isPreviewVisible,
              })}
            >
              <LocalMonacoEditor
                beforeMount={(monacoInstance) => {
                  monacoInstance.editor.defineTheme("transparentTheme", {
                    base: DraculaTheme.base as "vs" | "vs-dark" | "hc-black",
                    inherit: DraculaTheme.inherit,
                    rules: DraculaTheme.rules,
                    colors: {
                      ...DraculaTheme.colors,
                      "editor.background": "#00000000",
                    },
                  });
                  beforeMount?.(monacoInstance);
                }}
                language={language}
                onBlur={onBlur}
                onChange={(newValue) => {
                  setInternalValue(newValue);
                  debouncedOnChange(newValue);
                }}
                onMount={handleEditorDidMount}
                options={{
                  automaticLayout: true,
                  contextmenu: false,
                  folding: false,
                  fontSize: 14,
                  formatOnPaste: true,
                  formatOnType: true,
                  glyphMargin: false,
                  lineNumbers: showLineNumbers ? "on" : "off",
                  minimap: { enabled: false },
                  overviewRulerLanes: 0,
                  readOnly,
                  renderLineHighlight: "none",
                  scrollBeyondLastLine: false,
                  scrollbar: {
                    useShadows: false,
                    vertical: "auto",
                  },
                  tabSize: 2,
                  wordWrap: "off",
                }}
                theme="transparentTheme"
                value={internalValue}
              />
              {!internalValue?.trim() && placeholder && (
                <pre
                  className={cn(
                    "pointer-events-none absolute top-4 left-7 text-muted-foreground text-sm",
                    {
                      "left-16": showLineNumbers,
                    }
                  )}
                  style={{ userSelect: "none" }}
                >
                  {placeholder}
                </pre>
              )}
            </div>
            {render && isPreviewVisible && (
              <div className="w-1/2 flex-1 overflow-auto border-l p-4">
                {render(internalValue)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
