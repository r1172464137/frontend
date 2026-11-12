import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { getUserList } from "@workspace/ui/services/admin/admin";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function RoutingUsers({
  value,
  onChange,
  defaults = false,
}: {
  value: number[];
  onChange: (value: number[]) => void;
  defaults?: boolean;
}) {
  const { t } = useTranslation("servers");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ list: API.User[]; total: number }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError(false);
    const timer = setTimeout(() => {
      getUserList({ page, size: 20, search })
        .then(({ data }) => {
          if (active) {
            if (data.data) setResult(data.data); else setError(true);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, search]);
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {defaults
          ? t(
              "ordered_routing.defaults_users_hint",
              "Selected accounts: {{count}}.",
              { count: value.length }
            )
          : t(
              "ordered_routing.users_hint",
              "Selected accounts: {{count}}. No selection means all users.",
              { count: value.length }
            )}
      </p>
      <Input
        aria-label={t("ordered_routing.search_users", "Search accounts")}
        placeholder={t("ordered_routing.search_users", "Search accounts")}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Button
              key={id}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onChange(value.filter((v) => v !== id))}
            >
              #{id} ×
            </Button>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert">
          {t("ordered_routing.users_error", "Could not load accounts.")}
        </p>
      ) : result ? (
        <>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {result.list.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-2 break-all text-sm"
              >
                <Checkbox
                  checked={value.includes(user.id)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...value, user.id]
                        : value.filter((id) => id !== user.id)
                    )
                  }
                />
                {user.auth_methods?.find(
                  (method) => method.auth_type === "email"
                )?.auth_identifier || `#${user.id}`}{" "}
                (#{user.id})
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t("ordered_routing.previous", "Previous")}
            </Button>
            <span>{page}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page * 20 >= result.total}
              onClick={() => setPage(page + 1)}
            >
              {t("ordered_routing.next", "Next")}
            </Button>
          </div>
        </>
      ) : (
        <p>{t("ordered_routing.loading_users", "Loading accounts…")}</p>
      )}
    </div>
  );
}
