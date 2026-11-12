import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Switch } from "@workspace/ui/components/switch";
import { Icon } from "@workspace/ui/composed/icon";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getInterfaceConfig,
  interfaceConfigKey,
  putInterfaceConfig,
  systemConfigUrl,
} from "@/layout/interface-config";
import { useNavs } from "@/layout/navs";

export default function InterfaceForm() {
  const { t } = useTranslation("system");
  const navs = useNavs();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const loadSequence = useRef(0);

  async function load() {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(false);
    setDraft(null);
    try {
      const data = await client.fetchQuery({
        queryKey: interfaceConfigKey,
        queryFn: getInterfaceConfig,
        staleTime: 0,
      });
      if (sequence === loadSequence.current) setDraft([...data.hiddenMenuIds]);
    } catch {
      if (sequence === loadSequence.current) setError(true);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  function changeOpen(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (next) load();
    else loadSequence.current++;
  }
  async function save() {
    if (!draft || loading || saving) return;
    setSaving(true);
    try {
      await client.cancelQueries({ queryKey: interfaceConfigKey });
      await putInterfaceConfig({ hiddenMenuIds: draft });
      await client.cancelQueries({ queryKey: interfaceConfigKey });
      client.setQueryData(interfaceConfigKey, { hiddenMenuIds: draft });
      toast.success(t("common.saveSuccess", "Save Successful"));
      setOpen(false);
    } catch {
      toast.error(t("common.saveFailed", "Save Failed"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" icon="mdi:tune-variant" />
            </div>
            <div>
              <p className="font-medium">
                {t("interface.title", "Interface Settings")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t(
                  "interface.description",
                  "Show or hide admin menu items for all administrators"
                )}
              </p>
            </div>
          </div>
          <Icon className="size-6" icon="mdi:chevron-right" />
        </button>
      </SheetTrigger>
      <SheetContent className="w-[600px] max-w-full md:max-w-screen-md">
        <SheetHeader>
          <SheetTitle>{t("interface.title", "Interface Settings")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-48px-36px-36px-24px-env(safe-area-inset-top))] px-6">
          {loading && (
            <p className="py-4">{t("interface.loading", "Loading…")}</p>
          )}
          {error && (
            <div role="alert" className="space-y-2 py-4">
              <p>
                {t("interface.loadFailed", "Failed to load interface settings")}
              </p>
              <Button variant="outline" onClick={() => load()}>
                {t("interface.retry", "Retry")}
              </Button>
            </div>
          )}
          {draft && !loading && (
            <div className="space-y-5 py-4">
              <p className="text-muted-foreground text-sm">
                {t(
                  "interface.systemRequired",
                  "System settings is always visible."
                )}
              </p>
              {navs.map((nav) => {
                const items = nav.items ?? [nav];
                return (
                  <div key={nav.url ?? nav.title} className="space-y-2">
                    {nav.items && <h3 className="font-medium">{nav.title}</h3>}
                    {items.map(
                      (item) =>
                        item.url && (
                          <div
                            key={item.url}
                            className="flex items-center justify-between gap-4 py-1"
                          >
                            <span id={`menu-${item.url}`}>{item.title}</span>
                            <Switch
                              aria-labelledby={`menu-${item.url}`}
                              checked={
                                item.url === systemConfigUrl ||
                                !draft.includes(item.url)
                              }
                              disabled={item.url === systemConfigUrl || saving}
                              onCheckedChange={(checked) =>
                                setDraft(
                                  checked
                                    ? draft.filter((id) => id !== item.url)
                                    : [...draft, item.url!]
                                )
                              }
                            />
                          </div>
                        )
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDraft([])}
              >
                {t("interface.restore", "Show all")}
              </Button>
            </div>
          )}
        </ScrollArea>
        <SheetFooter className="flex-row justify-end gap-2 pt-3">
          <Button
            disabled={saving}
            onClick={() => changeOpen(false)}
            variant="outline"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={!draft || loading || saving}
            onClick={() => save()}
          >
            {t("common.save", "Save Settings")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
