import { useQuery } from "@tanstack/react-query";
import {
  getSystemInterfaceConfig,
  putSystemInterfaceConfig,
} from "@workspace/ui/services/admin/admin";
import type { NavItem } from "./navs";

export const interfaceConfigKey = ["admin", "interface-config"] as const;
export const systemConfigUrl = "/dashboard/system";
export type InterfaceConfig = { hiddenMenuIds: string[] };
export async function getInterfaceConfig(): Promise<InterfaceConfig> {
  const response = await getSystemInterfaceConfig({ skipErrorHandler: true });
  const data = response.data.data;
  if (
    !data ||
    !Array.isArray(data.hiddenMenuIds) ||
    !data.hiddenMenuIds.every((id) => typeof id === "string")
  )
    throw new Error("Invalid interface configuration");
  return data;
}
export async function putInterfaceConfig(data: InterfaceConfig): Promise<void> {
  await putSystemInterfaceConfig(data, { skipErrorHandler: true });
}
export function useInterfaceConfig() {
  return useQuery({
    queryKey: interfaceConfigKey,
    queryFn: getInterfaceConfig,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}
export function filterMenu(navs: NavItem[], hidden: string[]): NavItem[] {
  const ids = new Set(hidden);
  return navs.flatMap((nav) => {
    if (nav.items) {
      const items = filterMenu(nav.items, hidden);
      return items.length ? [{ ...nav, items }] : [];
    }
    return nav.url && nav.url !== systemConfigUrl && ids.has(nav.url)
      ? []
      : [nav];
  });
}
