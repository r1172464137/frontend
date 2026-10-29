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
    expect(Object.keys(zh.ordered_routing).sort()).toEqual(
      Object.keys(en.ordered_routing).sort()
    );
    expect(Object.keys(zh.ordered_routing.errors).sort()).toEqual(
      Object.keys(en.ordered_routing.errors).sort()
    );
    expect(en.server_config.fields.add_outbound).toBeTruthy();
    expect(zh.server_config.fields.add_outbound).toBeTruthy();
    expect(Object.keys(zh.dns_editor).sort()).toEqual(
      Object.keys(en.dns_editor).sort()
    );
  });
  it("explains offline saves, old-node 426 and copy recovery in both locales", () => {
    for (const locale of [en, zh]) {
      expect(locale.ordered_routing.offline_save).toContain("426");
      expect(locale.ordered_routing.copy_partial_title).toContain("{{id}}");
      expect(locale.ordered_routing.copy_partial_title).toContain("{{name}}");
      expect(locale.ordered_routing.copy_retry).toBeTruthy();
      expect(locale.ordered_routing.copy_edit).toBeTruthy();
      expect(Object.hasOwn(locale.ordered_routing, "server_ready")).toBe(false);
      expect(Object.hasOwn(locale.ordered_routing, "copy_unavailable")).toBe(
        false
      );
    }
  });
});
