"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { buttonVariants } from "@workspace/ui/components/button";
import { useOutsideClick } from "@workspace/ui/hooks/use-outside-click";
import { cn } from "@workspace/ui/lib/utils";
import { formatDate } from "@workspace/ui/utils/formatting";
import { AnimatePresence, motion } from "framer-motion";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTutorial } from "@/sections/user/document/tutorial";
import { CloseIcon } from "./close-icon";
import { TutorialMarkdown } from "./tutorial-markdown";

interface Item {
  path: string;
  title: string;
  updated_at?: string;
  icon?: string;
}
export function TutorialButton({ items }: { items: Item[] }) {
  const { t } = useTranslation("document");

  const [active, setActive] = useState<Item | boolean | null>(null);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    enabled: !!(active as Item)?.path,
    queryKey: ["getTutorial", (active as Item)?.path],
    queryFn: async () => {
      const markdown = await getTutorial((active as Item)?.path);
      return markdown;
    },
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(false);
      }
    }

    if (active && typeof active === "object") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  useOutsideClick(ref as RefObject<HTMLDivElement>, () => setActive(null));

  return (
    <>
      <AnimatePresence>
        {active && typeof active === "object" && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-10 h-full w-full bg-black/20"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && typeof active === "object" ? (
          <div className="fixed inset-0 z-[100] grid place-items-center">
            <motion.button
              animate={{
                opacity: 1,
              }}
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-white dark:text-black"
              exit={{
                opacity: 0,
                transition: {
                  duration: 0.05,
                },
              }}
              initial={{
                opacity: 0,
              }}
              key={`button-${active.title}-${id}`}
              layout
              onClick={() => setActive(null)}
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              className="flex size-full flex-col overflow-auto bg-muted p-6 sm:rounded"
              layoutId={`card-${active.title}-${id}`}
              ref={ref}
            >
              <TutorialMarkdown>{data?.content || ""}</TutorialMarkdown>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <div className="flex w-full flex-col gap-4">
        {items.map((item) => (
          <motion.div
            className="flex cursor-pointer items-center justify-between rounded-xl border bg-background p-4 hover:bg-accent"
            key={`card-${item.title}-${id}`}
            layoutId={`card-${item.title}-${id}`}
            onClick={() => setActive(item)}
          >
            <div className="flex flex-row items-center gap-4">
              <motion.div layoutId={`image-${item.title}-${id}`}>
                <Avatar className="size-12">
                  {item.icon && (
                    <AvatarImage alt={item.title ?? ""} src={item.icon} />
                  )}
                  <AvatarFallback className="bg-primary/80 text-white">
                    {item.title.split("")[0]}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              <div className="">
                <motion.h3
                  className="font-medium"
                  layoutId={`title-${item.title}-${id}`}
                >
                  {item.title}
                </motion.h3>
                {item.updated_at && (
                  <motion.p
                    className="text-center text-neutral-600 md:text-left dark:text-neutral-400"
                    layoutId={`description-${item.title}-${id}`}
                  >
                    {formatDate(new Date(item.updated_at), false)}
                  </motion.p>
                )}
              </div>
            </div>
            <motion.button
              className={cn(
                buttonVariants({
                  variant: "secondary",
                }),
                "rounded-full"
              )}
              layoutId={`button-${item.title}-${id}`}
            >
              {t("read", "Read")}
            </motion.button>
          </motion.div>
        ))}
      </div>
    </>
  );
}
