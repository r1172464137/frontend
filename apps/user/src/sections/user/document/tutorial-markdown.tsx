"use client";

import { Markdown } from "@workspace/ui/composed/markdown";
import { isSameOriginTutorialAssetPath } from "./tutorial";

/**
 * Tutorial snapshots are repository/build inputs rather than operator-authored
 * documents. Keep their renderer deliberately narrower: raw HTML is disabled,
 * and only path-based, same-origin images survive the component boundary.
 */
export function TutorialMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      allowRawHtml={false}
      components={{
        img: ({ node, className, src, ...props }: any) => {
          if (!isSameOriginTutorialAssetPath(src)) {
            return null;
          }

          return (
            <img
              {...props}
              alt=""
              className="my-4 inline-block size-auto max-h-96"
              height={384}
              src={src}
              width={800}
            />
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}
