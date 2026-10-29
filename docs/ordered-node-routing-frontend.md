# 管理端有序节点路由：cutover-only 契约

后端停机 preflight 负责将旧数据转换为 routing v1；运行期仅有全局 v1 和服务器整包继承/本地覆盖。面板不提供在线 legacy 编辑、转换、预览或回退。生产发布、停机切换和节点升级仍需单独授权；具体 preflight、备份与回滚步骤以 backend 的 `docs/design/ordered-node-routing.md` 为准。

## API 和编辑方式

- `GET /v1/admin/system/node_config` 返回基础配置、`routing`、`routing_revision`、`routing_mode: "global-v1"` 和 `routing_capabilities: [1]`。全局 `routing` 必须存在。`routing_capabilities` 是**后端支持的版本列表**，不代表任何节点在线或已应用。
- `PUT /v1/admin/system/node_config` 使用同一顶层 `routing_revision` 进行全局 CAS，仅在路由修改时包含完整 `routing`。DNS、IP 策略、密钥和拉取/推送周期只在对应字段被编辑时提交，空字符串不被改为默认值；不提交 `block`、`block_ips`、`block_protocols`、`outbound` 或 `routing_action`。节点周期要求整数 0–86400 秒。
- `GET /v1/admin/server/node_config?server_id=…` 返回 `global`、`override`、`effective`、`routing_status`。`override.routing: null` 且 `inherit_routing: true` 表示整包继承；本地 `routing` 是完整独立包。`effective.routing` 包含只读身份 `mode/source/source_server_id/source_revision/local_transition_revision`，它们只用于显示和回执比较，保存前从包顶层移除。
- 服务器关闭“使用全局路由”时，以当前生效全局包创建可编辑本地草稿；保存通过 `POST /v1/admin/server/node_config/update` 提交 `{server_id, routing, routing_revision, …被编辑的非路由设置}`。DNS/IP 编辑时携带必要的继承开关；未编辑的不提交。本地包保存后不再传播全局路由变化。恢复继承则提交 `{server_id, inherit_routing: true, routing_revision, …被编辑的非路由设置}`，不提交 `routing: null`。局部空 `rules: []` 是有效本地包，并非继承。全局和本地各自 CAS，不承诺跨属主原子合并。
- 每个路由写入由后端比较所在作用域的 revision 并递增，继承操作保留递增后的本地元数据。实际 HTTP 409 的业务码为全局 `160001`、服务器 `140002`：保留本地草稿，要求管理员显式刷新并丢弃后重新编辑。旧路由字段写入由后端返回 HTTP 422（`160003` / `140003`）。本地包写入和恢复继承不依赖节点在线或新鲜回执；离线服务器可预配置，回执只决定应用状态。旧节点拉取仍返回 HTTP 426，前端不把后端版本列表当作节点能力。
- 正常保存后会再次读取并核对路由包、revision 和实际提交的非路由字段；DNS 读回按后端地址、端口与域名规则的规范化和按序去重语义比较。HTTP 200 业务码 `400` 是明确前置校验失败，保留可编辑草稿而不锁定冲突；其他不确定业务错误先读回，避免把数据库已提交、后续清缓存失败误判为未写入。面板保存不代表节点应用；超时、读回不符或写入结果不明时阻止继续覆盖，要求刷新核实。
- 同批后端创建服务器响应为 `{data: {id}}`。复制操作先读取并校验源配置，再创建一次并固定目标 ID，复制 DNS/IP 策略及本地路由或全局继承，最后从目标权威读回核对。创建后的配置失败会明确显示目标 ID/名称，并提供编辑和仅重试目标配置的操作，绝不自动重复创建。创建响应缺失 ID、超时或创建结果不确定时，显示协议/结果不确定并要求先核查服务器列表；后端创建接口无幂等键，不能安全推测 ID 或自动重试。配置写入超时后仍先权威读回，已提交则无需重复写入。为避免在浏览器持久化路由密钥，恢复草稿仅保存在当前页面；刷新或离开后需通过服务器列表进入目标配置并人工核对。

## 有序规则与连接

DNS 只提供 UDP，空旧协议值按 UDP 编辑；地址接受主机名或 IP，可带 1–65535 端口（IPv6 带端口需方括号），不接受 scheme/path。域名列表使用同一有序路由规则校验和逐行错误，文本编辑时保留空行及未完成草稿；DNS 写入清空不受节点使用的 `server_name`。非 DNS 保存仍保持 dirty-only，不会为此改写已有数据。

全局和服务器页面共用 `NodeRoutingEditor`。内置 `direct` / `block`、`ob_<UUIDv4>` 连接及 `rr_<UUIDv4>` 规则使用稳定 ID。规则数组顺序决定首条命中，匹配类别仅为 `domain` / `ip` / `protocol`，`enabled` 必须明确（含 `false`）。有鼠标、触摸、键盘拖动及上/下按钮。已禁用规则和默认出口仍保护连接引用，不能删除被引用连接；改名不修改 ID。长规则换行显示，编辑器保留完整内容。

连接表单不调用旧规范化路径，不补默认 transport、fingerprint 或 flow，不重建隐藏连接字段。节点能力检查阻止 TUIC、非默认 UoT/multiplex、插件以及无 raw settings 时的非默认投影加密；有 raw settings 时投影加密字段由节点忽略，仍原样保留。非空 raw settings 完全覆盖连接字段；前端按协议检查完整的简写或 `servers`/`vnext` 结构，不从投影补齐缺失地址、端口或凭据，空对象仅适用于 direct/reject。raw stream 和嵌套下载配置检查 security、TLS/REALITY 参数和节点限制；HTTP/XHTTP 的 headers 是不透明字符串表，不把其中的 `security` 当作 stream security。已存在的不支持值保留并展示原因，只有管理员明确移除后才改写。VLESS REALITY 和适用的 Vision flow 可选；ALPN 使用本地多行草稿，密码和原始 JSON 不自动去空白。读回比较仅模拟后端已明确的规范化：名称/协议首尾空白、规则值规范化、出站的空旧 wire 数组及 Go `omitempty` 零值。后台 `config.NodeOutbound` 本身用 `omitempty`，因此 `false` / 空字符串 / 空 `alpn` 等可选连接字段的**presence** 在 HTTP 往返中会消失；业务值和 `RouteRule.enabled: false` 仍保留。后端严格拒绝其 DTO 未声明的未知字段；前端保留已收到的隐藏合法字段，但不能承诺后端支持任意未来扩展字段。

## 应用状态

服务器页使用真实 `routing_status: {known, reporter_verified, report?}`。`report` 包含 `routing_version`、`routing_sequence`、`instance_id`、`received_at`、`liveness_at`、`updated_at` 以及可选 `routing_pending`、`routing_applied`、`routing_error`。`routing_sequence` 为后端 uint64 上报序列，前端不做 JavaScript 数值排序；`updated_at` 是节点时钟信息，可为 0 或回拨，不参与有效性判定；`liveness_at` 可以来自旧包或重复包，不延长内容回执有效期。仅当后端 `known` / `reporter_verified` 为真、新鲜内容回执的身份与当前 `effective.routing` 五元身份完全一致时，才显示 pending/applied/failed；后端识别到多实例冲突、过期、Redis 丢失、旧或未知节点时显示 unknown。前端同时按当前后端 `routingstatus.TTL` 的 3 分钟期限使打开的页面到期变为 unknown，并提供手动刷新；它使用浏览器时钟比较 Redis 接收时间，时钟偏差会影响前端显示期限，服务端始终是权威判断。

旧节点不具备协议能力会收到 HTTP 426，这是同批部署阻断，不是在线转换按钮。全局页面不能凭全局保存声明所有节点已应用，请查看每台服务器的回执。

## 测试范围

本地测试覆盖 schema、节点连接能力、字段 presence、ALPN、DNS/IP 读回、HTTP 200 提交后错误、`false`、显式空规则、引用、排序、服务器继承/覆盖、真实 HTTP 409 的响应体、实际 DTO 形状、实例冲突及 TTL。`bun run test:openapi` 在临时目录实际生成 admin 服务、逐文件比较并执行 TypeScript 检查；普通 root `bun run test` 和 release 工作流都会运行该检查。窄类型和节点配置 service 位于生成目录之外。jsdom 鼠标/触摸/键盘测试使用模拟布局，不代替真实浏览器和移动设备测试，也不代替 backend/ppnode 数据面与节点回执联调。
