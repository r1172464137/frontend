"use client";

import type { AnimationItem, LottiePlayer } from "lottie-web";
import type { HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

export interface LocalLottieProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  animationData?: Record<string, unknown>;
  autoplay?: boolean;
  loop?: boolean | number;
  src?: string;
}

export function isSameOriginLottieSource(source: string, pageUrl: string) {
  try {
    const sourceUrl = new URL(source, pageUrl);
    return sourceUrl.origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Renders Lottie JSON with the locally installed lottie-web package. This
 * replaces DotLottie's WASM runtime, whose packaged default includes public
 * CDN fallbacks.
 */
export function DotLottieReact({
  animationData,
  autoplay = false,
  className,
  loop = false,
  src,
  ...props
}: LocalLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const autoplayRef = useRef(autoplay);

  useEffect(() => {
    autoplayRef.current = autoplay;
    if (autoplay) {
      animationRef.current?.play();
    } else {
      animationRef.current?.pause();
    }
  }, [autoplay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!(container && (animationData || src))) {
      return;
    }
    if (src && !isSameOriginLottieSource(src, window.location.href)) {
      return;
    }

    let active = true;
    let animation: AnimationItem | null = null;

    import("lottie-web").then((module) => {
      if (!active) {
        return;
      }

      // lottie-web is CommonJS with default-export typings; Vite normalizes
      // the runtime module to this default player object.
      const lottie = module.default as unknown as LottiePlayer;
      const source = animationData
        ? { animationData }
        : { path: src as string };
      const loadedAnimation = lottie.loadAnimation({
        ...source,
        autoplay: false,
        container,
        loop,
        renderer: "svg",
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
        },
      });
      animation = loadedAnimation;
      animationRef.current = loadedAnimation;
      if (autoplayRef.current) {
        loadedAnimation.play();
      }
    });

    return () => {
      active = false;
      animation?.destroy();
      if (animationRef.current === animation) {
        animationRef.current = null;
      }
    };
  }, [animationData, loop, src]);

  return <div {...props} className={className} ref={containerRef} />;
}

interface DeferredLottieProps extends LocalLottieProps {
  rootMargin?: string;
  threshold?: number;
}

/**
 * Defers decorative animations until they are close to the viewport, pauses
 * them while off-screen, and avoids loading the renderer for reduced-motion
 * users. The className is applied to the stable placeholder container.
 */
export function DeferredDotLottie({
  autoplay,
  className,
  rootMargin = "0px",
  threshold = 0.25,
  ...props
}: DeferredLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(
          entry?.isIntersecting && entry.intersectionRatio >= threshold
        );
        setIsVisible(visible);
        if (visible) {
          setShouldRender(true);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return (
    <div className={className} ref={containerRef}>
      {shouldRender && !prefersReducedMotion ? (
        <DotLottieReact
          {...props}
          autoplay={Boolean(autoplay && isVisible)}
          className="size-full"
        />
      ) : null}
    </div>
  );
}
