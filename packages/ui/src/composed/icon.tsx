"use client";

import {
  Icon as Iconify,
  type IconifyIcon,
  type IconProps,
} from "@iconify/react/offline";
import LocalIconFallback from "@iconify-icons/mdi/help-circle-outline";
import { useEffect, useState } from "react";
import { isBundledIcon, loadBundledIcon } from "./icons.js";

const EMPTY_ICON: IconifyIcon = {
  body: "",
  height: 24,
  width: 24,
};

interface LoadedIcon {
  data: IconifyIcon;
  name: string;
}

/** Converts every string name to local icon data before it reaches Iconify. */
export function resolveLocalIcon(
  name: string,
  bundledIcon?: IconifyIcon
): IconifyIcon {
  return isBundledIcon(name) ? (bundledIcon ?? EMPTY_ICON) : LocalIconFallback;
}

export function Icon(props: IconProps) {
  const [loadedIcon, setLoadedIcon] = useState<LoadedIcon>();
  const iconName = typeof props.icon === "string" ? props.icon : undefined;
  const usesBundledIcon = Boolean(iconName && isBundledIcon(iconName));

  useEffect(() => {
    if (!(iconName && usesBundledIcon)) {
      return;
    }

    let active = true;
    loadBundledIcon(iconName).then((data) => {
      if (active && data) {
        setLoadedIcon({ data, name: iconName });
      }
    });

    return () => {
      active = false;
    };
  }, [iconName]);

  const icon =
    iconName === undefined
      ? props.icon
      : resolveLocalIcon(
          iconName,
          loadedIcon?.name === iconName ? loadedIcon.data : undefined
        );

  return <Iconify {...props} icon={icon} />;
}
