const NODE_REPOSITORY = "r1172464137/ppanel-node";
const NODE_VERSION = "v1.1.15";
const INSTALLER_URL = `https://github.com/${NODE_REPOSITORY}/releases/download/${NODE_VERSION}/install.sh`;

function shellQuote(value: string | number) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function buildServerInstallCommand({
  apiHost,
  serverId,
  secret,
}: {
  apiHost: string;
  serverId: string | number;
  secret: string;
}) {
  // A subshell keeps the temporary directory and cleanup trap out of the
  // caller's shell. Never overwrite or execute install.sh in their directory.
  return [
    "(tmpdir=$(mktemp -d) && trap 'rm -rf \"$tmpdir\"' EXIT",
    `&& wget -O "$tmpdir/install.sh" ${shellQuote(INSTALLER_URL)}`,
    `&& bash "$tmpdir/install.sh" ${shellQuote(NODE_VERSION)}`,
    `--api-host ${shellQuote(apiHost)}`,
    `--server-id ${shellQuote(serverId)}`,
    `--secret-key ${shellQuote(secret)})`,
  ].join(" ");
}
