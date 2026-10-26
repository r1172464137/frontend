"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import type { MarkdownProps } from "./markdown";
import { appUrlTransform, markdownComponents } from "./markdown-elements";

export default function MarkdownImpl({
  allowRawHtml,
  children,
  components,
}: MarkdownProps) {
  const rawHtmlEnabled = allowRawHtml !== false;

  return (
    <div className="prose dark:prose-invert wrap-break-word w-full max-w-[unset]">
      <ReactMarkdown
        components={{ ...markdownComponents, ...components }}
        rehypePlugins={rawHtmlEnabled ? [rehypeRaw] : []}
        remarkPlugins={[remarkGfm, remarkToc]}
        skipHtml={!rawHtmlEnabled}
        urlTransform={appUrlTransform}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
