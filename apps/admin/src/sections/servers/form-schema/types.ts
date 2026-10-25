import type { protocols } from "./constants";

export type FieldConfig = {
  name: string;
  type:
    | "input"
    | "select"
    | "switch"
    | "number"
    | "textarea"
    | "string-list"
    | "json";
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  valueType?: "number";
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  generate?: {
    // Receives the protocol being edited so a generator can depend on a
    // sibling field, e.g. the Shadowsocks 2022 key length follows the cipher.
    function?: (
      protocol?: any
    ) =>
      | Promise<string | Record<string, string>>
      | string
      | Record<string, string>;
    functions?: {
      label: string;
      function: (
        protocol?: any
      ) =>
        | Promise<string | Record<string, string>>
        | string
        | Record<string, string>;
    }[];
    updateFields?: Record<string, string>;
  };
  condition?: (protocol: any, values: any) => boolean;
  group?:
    | "basic"
    | "transport"
    | "security"
    | "reality"
    | "obfs"
    | "encryption";
  gridSpan?: 1 | 2;
};

export type ProtocolType = (typeof protocols)[number];
