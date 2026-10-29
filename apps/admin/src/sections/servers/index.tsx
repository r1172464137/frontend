"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { ConfirmButton } from "@workspace/ui/composed/confirm-button";
import { Icon } from "@workspace/ui/composed/icon";
import {
  ProTable,
  type ProTableActions,
} from "@workspace/ui/composed/pro-table/pro-table";
import { cn } from "@workspace/ui/lib/utils";
import {
  postServerCreate as createServer,
  postServerOpenApiDelete as deleteServer,
  getServerList as filterServerList,
  postServerServerSort as resetSortWithServer,
  postServerUpdate as updateServer,
} from "@workspace/ui/services/admin/admin";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useNode } from "@/stores/node";
import { useServer } from "@/stores/server";
import DynamicMultiplier from "./dynamic-multiplier";
import OnlineUsersCell from "./online-users-cell";
import ServerConfig from "./server-config";
import {
  applyServerCopy,
  beginServerCopy,
  type ServerCopyTask,
} from "./server-copy";
import ServerForm from "./server-form";
import ServerInstall from "./server-install";
import ServerNodeConfig from "./server-node-config";

function PctBar({ value }: { value: number }) {
  const v = value.toFixed(2);
  const widthClass =
    value >= 90
      ? "w-[90%]"
      : value >= 80
        ? "w-4/5"
        : value >= 70
          ? "w-[70%]"
          : value >= 60
            ? "w-3/5"
            : value >= 50
              ? "w-1/2"
              : value >= 40
                ? "w-2/5"
                : value >= 30
                  ? "w-[30%]"
                  : value >= 20
                    ? "w-1/5"
                    : value >= 10
                      ? "w-[10%]"
                      : "w-0";
  return (
    <div className="min-w-24">
      <div className="text-xs leading-none">{v}%</div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div className={cn("h-1.5 rounded bg-primary", widthClass)} />
      </div>
    </div>
  );
}

function RegionIpCell({
  country,
  city,
  ip,
  notAvailableText,
}: {
  country?: string;
  city?: string;
  ip?: string;
  notAvailableText: string;
}) {
  const region =
    [country, city].filter(Boolean).join(" / ") || notAvailableText;
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline">{region}</Badge>
      <Badge variant="secondary">{ip || notAvailableText}</Badge>
    </div>
  );
}

function ServerMoreActions({
  server,
  loading,
  referencedByNodes,
  onEdit,
  onCopy,
  onDelete,
  copyBlocked,
}: {
  server: API.Server;
  loading: boolean;
  referencedByNodes: boolean;
  onEdit: (values: Partial<API.Server>) => Promise<boolean>;
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
  copyBlocked: boolean;
}) {
  const { t } = useTranslation("servers");
  const editRef = useRef<HTMLButtonElement>(null);
  const connectRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("moreActions", "More actions")}
            size="icon"
            variant="outline"
          >
            <Icon icon="mdi:dots-horizontal" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              editRef.current?.click();
            }}
          >
            <Icon icon="mdi:pencil-outline" />
            {t("edit", "Edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              connectRef.current?.click();
            }}
          >
            <Icon icon="mdi:console-line" />
            {t("connect", "Connect")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={loading || copyBlocked} onSelect={onCopy}>
            <Icon icon="mdi:content-copy" />
            {t("copy", "Copy")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={referencedByNodes}
            onSelect={(event) => {
              event.preventDefault();
              deleteRef.current?.click();
            }}
            variant="destructive"
          >
            <Icon icon="mdi:trash-can-outline" />
            {t("delete", "Delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ServerForm
        initialValues={server}
        loading={loading}
        onSubmit={onEdit}
        title={t("drawerEditTitle", "Edit Server")}
        trigger={<Button aria-hidden="true" className="hidden" ref={editRef} />}
      />
      <ServerInstall
        server={server}
        trigger={
          <Button aria-hidden="true" className="hidden" ref={connectRef} />
        }
      />
      <ConfirmButton
        cancelText={t("cancel", "Cancel")}
        confirmText={t("confirm", "Confirm")}
        description={t("confirmDeleteDesc", "This action cannot be undone.")}
        onConfirm={onDelete}
        title={t("confirmDeleteTitle", "Delete this server?")}
        trigger={
          <Button aria-hidden="true" className="hidden" ref={deleteRef} />
        }
      />
    </>
  );
}

export default function Servers() {
  const { t } = useTranslation("servers");
  const { isServerReferencedByNodes } = useNode();
  const { fetchServers } = useServer();

  const [loading, setLoading] = useState(false);
  const [copyState, setCopyState] = useState<
    | { kind: "partial" | "working"; task: ServerCopyTask }
    | { kind: "unknown"; sourceName: string }
  >();
  const ref = useRef<ProTableActions>(null);
  const copyLock = useRef(false);
  const copyUnresolved = useRef(false);

  function refreshServers() {
    ref.current?.refresh();
    fetchServers();
  }
  async function finishCopy(task: ServerCopyTask) {
    let complete = false;
    try {
      complete = await applyServerCopy(task);
    } catch {
      complete = false;
    }
    if (complete) {
      copyUnresolved.current = false;
      setCopyState(undefined);
      toast.success(
        t(
          "ordered_routing.copy_saved",
          "Copied and verified in the panel; node application is not yet confirmed."
        )
      );
      refreshServers();
    } else setCopyState({ kind: "partial", task });
  }
  async function copyServer(row: API.Server) {
    if (loading || copyUnresolved.current || copyLock.current) return;
    copyLock.current = true;
    setLoading(true);
    let createdTask: ServerCopyTask | undefined;
    try {
      const result = await beginServerCopy(row);
      if (result.kind === "source_error" || result.kind === "invalid_source") {
        toast.error(
          t(
            "ordered_routing.copy_source_error",
            "Cannot copy this server: its node configuration is unavailable or invalid. No server was created."
          )
        );
      } else if (result.kind === "create_unknown") {
        copyUnresolved.current = true;
        setCopyState({ kind: "unknown", sourceName: row.name });
        refreshServers();
      } else {
        createdTask = result.task;
        copyUnresolved.current = true;
        setCopyState({ kind: "working", task: result.task });
        refreshServers();
        await finishCopy(result.task);
      }
    } catch {
      if (createdTask) setCopyState({ kind: "partial", task: createdTask });
      else if (!copyUnresolved.current)
        toast.error(
          t(
            "ordered_routing.copy_source_error",
            "Cannot copy this server: its node configuration is unavailable or invalid. No server was created."
          )
        );
    } finally {
      copyLock.current = false;
      setLoading(false);
    }
  }
  async function retryCopy(task: ServerCopyTask) {
    if (loading || copyLock.current) return;
    copyLock.current = true;
    setLoading(true);
    setCopyState({ kind: "working", task });
    try {
      await finishCopy(task);
    } catch {
      setCopyState({ kind: "partial", task });
    } finally {
      copyLock.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {copyState ? (
        <Alert
          role={copyState.kind === "working" ? "status" : "alert"}
          variant={copyState.kind === "working" ? "default" : "destructive"}
        >
          <AlertTitle className="line-clamp-none">
            {copyState.kind === "unknown"
              ? t(
                  "ordered_routing.copy_unknown_title",
                  "Create result for {{name}} is unknown (server ID not confirmed).",
                  { name: copyState.sourceName }
                )
              : copyState.kind === "working"
                ? t(
                    "ordered_routing.copy_progress_title",
                    "Server created (ID {{id}}, {{name}}); copying configuration…",
                    {
                      id: copyState.task.target.id,
                      name: copyState.task.target.name,
                    }
                  )
                : t(
                    "ordered_routing.copy_partial_title",
                    "Server created (ID {{id}}, {{name}}), but configuration copy is incomplete.",
                    {
                      id: copyState.task.target.id,
                      name: copyState.task.target.name,
                    }
                  )}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {copyState.kind === "unknown"
                ? t(
                    "ordered_routing.copy_unknown_desc",
                    "A successful response without a valid ID violates the backend contract. The request may have created a server; check the list before copying again. Creation will not be retried automatically."
                  )
                : copyState.kind === "working"
                  ? t(
                      "ordered_routing.copy_progress_desc",
                      "Copying and verifying the target configuration. Please wait."
                    )
                  : t(
                      "ordered_routing.copy_partial_desc",
                      "Retry applies the original DNS, IP strategy and routing to this existing server; it never creates another server. Verify any manual changes before retrying."
                    )}
            </p>
            {copyState.kind !== "working" ? (
              <div className="flex flex-wrap gap-2">
                {copyState.kind === "partial" ? (
                  <>
                    <Button
                      disabled={loading}
                      onClick={() => retryCopy(copyState.task)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("ordered_routing.copy_retry", "Retry configuration")}
                    </Button>
                    <ServerNodeConfig
                      server={copyState.task.target}
                      triggerDisabled={loading}
                      triggerLabel={t(
                        "ordered_routing.copy_edit",
                        "Edit configuration"
                      )}
                    />
                  </>
                ) : (
                  <Button
                    disabled={loading}
                    onClick={refreshServers}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("ordered_routing.copy_refresh", "Refresh server list")}
                  </Button>
                )}
                <Button
                  disabled={loading}
                  onClick={() => {
                    copyUnresolved.current = false;
                    setCopyState(undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("ordered_routing.copy_dismiss", "Dismiss after checking")}
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DynamicMultiplier />
        <ServerConfig />
      </div>
      <ProTable<API.Server, { search: string }>
        action={ref}
        actions={{
          render: (row) => [
            <ServerNodeConfig key="node-config" server={row} />,
            <ServerMoreActions
              copyBlocked={Boolean(copyState)}
              key="more"
              loading={loading}
              onCopy={() => copyServer(row)}
              onDelete={async () => {
                await deleteServer({ id: row.id } as API.DeleteServerRequest);
                toast.success(t("deleted", "Deleted"));
                ref.current?.refresh();
                fetchServers();
              }}
              onEdit={async (values) => {
                setLoading(true);
                try {
                  await updateServer({
                    id: row.id,
                    ...(values as unknown as Omit<
                      API.UpdateServerRequest,
                      "id"
                    >),
                  });
                  toast.success(t("updated", "Updated"));
                  ref.current?.refresh();
                  fetchServers();
                  setLoading(false);
                  return true;
                } catch {
                  setLoading(false);
                  return false;
                }
              }}
              referencedByNodes={isServerReferencedByNodes(row.id)}
              server={row}
            />,
          ],
          batchRender(rows) {
            const hasReferencedServers = rows.some((row) =>
              isServerReferencedByNodes(row.id)
            );
            return [
              <ConfirmButton
                cancelText={t("cancel", "Cancel")}
                confirmText={t("confirm", "Confirm")}
                description={t(
                  "confirmDeleteDesc",
                  "This action cannot be undone."
                )}
                key="delete"
                onConfirm={async () => {
                  await Promise.all(
                    rows.map((r) => deleteServer({ id: r.id }))
                  );
                  toast.success(t("deleted", "Deleted"));
                  ref.current?.refresh();
                  fetchServers();
                }}
                title={t("confirmDeleteTitle", "Delete this server?")}
                trigger={
                  <Button disabled={hasReferencedServers} variant="destructive">
                    {t("delete", "Delete")}
                  </Button>
                }
              />,
            ];
          },
        }}
        columns={[
          {
            accessorKey: "id",
            header: t("id", "ID"),
            cell: ({ row }) => <Badge>{row.getValue("id")}</Badge>,
          },
          { accessorKey: "name", header: t("name", "Name") },
          {
            id: "region_ip",
            header: t("address", "Address"),
            cell: ({ row }) => (
              <RegionIpCell
                city={row.original.city as unknown as string}
                country={row.original.country as unknown as string}
                ip={row.original.address as unknown as string}
                notAvailableText={t("notAvailable", "Not Available")}
              />
            ),
          },
          {
            accessorKey: "protocols",
            header: t("protocols", "Protocols"),
            cell: ({ row }) => {
              const list = row.original.protocols.filter(
                (p) => p.enable
              ) as API.Protocol[];
              if (!list.length) return "—";
              return (
                <div className="flex flex-col gap-1">
                  {list.map((p, idx) => {
                    const ratio = Number(p.ratio ?? 1) || 1;
                    return (
                      <div className="flex items-center gap-2" key={idx}>
                        <Badge variant="outline">{ratio.toFixed(2)}x</Badge>
                        <Badge variant="secondary">{p.type}</Badge>
                        <Badge variant="secondary">{p.port}</Badge>
                      </div>
                    );
                  })}
                </div>
              );
            },
          },

          {
            id: "status",
            header: t("status", "Status"),
            cell: ({ row }) => {
              const offline = row.original.status.status === "offline";
              return (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full",
                      offline ? "bg-zinc-400" : "bg-emerald-500"
                    )}
                  />
                  <span className="text-sm">
                    {offline ? t("offline", "Offline") : t("online", "Online")}
                  </span>
                </div>
              );
            },
          },
          {
            id: "cpu",
            header: t("cpu", "CPU"),
            cell: ({ row }) => (
              <PctBar
                value={(row.original.status?.cpu as unknown as number) ?? 0}
              />
            ),
          },
          {
            id: "mem",
            header: t("memory", "Memory"),
            cell: ({ row }) => (
              <PctBar
                value={(row.original.status?.mem as unknown as number) ?? 0}
              />
            ),
          },
          {
            id: "disk",
            header: t("disk", "Disk"),
            cell: ({ row }) => (
              <PctBar
                value={(row.original.status?.disk as unknown as number) ?? 0}
              />
            ),
          },

          {
            id: "online_users",
            header: t("onlineUsers", "Online Users"),
            cell: ({ row }) => (
              <OnlineUsersCell
                status={row.original.status as API.ServerStatus}
              />
            ),
          },
        ]}
        header={{
          title: t("pageTitle", "Servers"),
          toolbar: (
            <div className="flex gap-2">
              <ServerForm
                loading={loading}
                onSubmit={async (values) => {
                  setLoading(true);
                  try {
                    await createServer(
                      values as unknown as API.CreateServerRequest
                    );
                    toast.success(t("created", "Created"));
                    ref.current?.refresh();
                    fetchServers();
                    setLoading(false);
                    return true;
                  } catch {
                    setLoading(false);
                    return false;
                  }
                }}
                title={t("drawerCreateTitle", "Create Server")}
                trigger={t("create", "Create")}
              />
            </div>
          ),
        }}
        onSort={async (source, target, items) => {
          const sourceIndex = items.findIndex(
            (item) => String(item.id) === source
          );
          const targetIndex = items.findIndex(
            (item) => String(item.id) === target
          );

          const originalSorts = items.map((item) => item.sort);

          const [movedItem] = items.splice(sourceIndex, 1);
          items.splice(targetIndex, 0, movedItem!);

          const updatedItems = items.map((item, index) => {
            const originalSort = originalSorts[index];
            const newSort =
              originalSort !== undefined ? originalSort : item.sort;
            return { ...item, sort: newSort };
          });

          const changedItems = updatedItems.filter(
            (item, index) => item.sort !== items[index]?.sort
          );

          if (changedItems.length > 0) {
            resetSortWithServer({
              sort: changedItems.map((item) => ({
                id: item.id,
                sort: item.sort,
              })) as API.SortItem[],
            });
            toast.success(t("sorted_success", "Sorted successfully"));
          }
          return updatedItems;
        }}
        params={[{ key: "search" }]}
        request={async (pagination, filter) => {
          const { data } = await filterServerList({
            page: pagination.page,
            size: pagination.size,
            search: filter?.search || undefined,
          });
          const list = (data?.data?.list || []) as API.Server[];
          const total = (data?.data?.total ?? list.length) as number;
          return { list, total };
        }}
      />
    </div>
  );
}
