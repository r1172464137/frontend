import { describe, expect, it } from "vitest";
import en from "../../../public/assets/locales/en-US/servers.json";
import zh from "../../../public/assets/locales/zh-CN/servers.json";

describe("structured route-rule translations", () => {
  it("ships matching English and Chinese labels and warnings", () => {
    expect(en.route_rules.domain_label).toBe("Domain / GeoSite / RE2 Regex");
    expect(en.route_rules.ip_label).toBe("IP / GeoIP / CIDR");
    expect(en.route_rules.bittorrent_label).toContain("µTP");
    expect(en.route_rules.socks_udp_warning).toContain("UDP Associate");

    expect(zh.route_rules.domain_label).toBe("域名 / GeoSite / RE2 正则");
    expect(zh.route_rules.ip_label).toBe("IP / GeoIP / CIDR");
    expect(zh.route_rules.bittorrent_label).toContain("µTP");
    expect(zh.route_rules.socks_udp_warning).toContain("UDP Associate");
    expect(Object.keys(zh.route_rules.errors).sort()).toEqual(
      Object.keys(en.route_rules.errors).sort()
    );
  });
});
