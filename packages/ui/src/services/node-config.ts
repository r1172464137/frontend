/// <reference path="../node-routing-contract.d.ts" />
import request from "@workspace/ui/lib/request";
import type { AxiosResponse } from "axios";

type Options = { skipErrorHandler?: boolean; timeout?: number };
type Envelope<T> = API.ResponseSuccessBean & { data?: T };
const prefix = () => `${import.meta.env.VITE_API_PREFIX || ""}/v1/admin`;
export function getSystemNodeConfig(): Promise<
  AxiosResponse<Envelope<API.NodeConfig>>
> {
  return request<
    Envelope<API.NodeConfig>,
    AxiosResponse<Envelope<API.NodeConfig>>
  >(`${prefix()}/system/node_config`, { method: "GET" });
}
export function putSystemNodeConfig(
  body: API.UpdateNodeConfigRequest,
  options?: Options
): Promise<AxiosResponse<API.ResponseSuccessBean>> {
  return request<
    API.ResponseSuccessBean,
    AxiosResponse<API.ResponseSuccessBean>
  >(`${prefix()}/system/node_config`, {
    method: "PUT",
    data: body,
    ...options,
  });
}
export function getServerNodeConfig(
  params: { server_id: number },
  options?: Options
): Promise<AxiosResponse<Envelope<API.GetServerNodeConfigResponse>>> {
  return request<
    Envelope<API.GetServerNodeConfigResponse>,
    AxiosResponse<Envelope<API.GetServerNodeConfigResponse>>
  >(`${prefix()}/server/node_config`, { method: "GET", params, ...options });
}
export function postServerNodeConfigUpdate(
  body: API.UpdateServerNodeConfigRequest,
  options?: Options
): Promise<AxiosResponse<API.ResponseSuccessBean>> {
  return request<
    API.ResponseSuccessBean,
    AxiosResponse<API.ResponseSuccessBean>
  >(`${prefix()}/server/node_config/update`, {
    method: "POST",
    data: body,
    ...options,
  });
}
