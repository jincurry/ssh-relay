import { describe, expect, it } from "vitest";
import { buildPaletteResults, findPaletteMatches, formatUserHostPort, parseQuickConnect } from "./hosts.js";

describe("parseQuickConnect", () => {
  it("parses user@host with default port", () => {
    expect(parseQuickConnect("deploy@example.com")).toMatchObject({
      id: "temp-deploy@example.com:22",
      name: "example.com",
      host: "example.com",
      user: "deploy",
      port: 22,
      temporary: true
    });
  });

  it("parses explicit ports and IPv6 hosts", () => {
    expect(parseQuickConnect("root@192.168.1.10:2222")).toMatchObject({
      host: "192.168.1.10",
      port: 2222
    });
    expect(parseQuickConnect("ops@2001:db8::1")).toMatchObject({
      host: "2001:db8::1",
      port: 22
    });
    expect(parseQuickConnect("ops@[2001:db8::1]:2200")).toMatchObject({
      host: "2001:db8::1",
      port: 2200
    });
    expect(parseQuickConnect("root@::")).toMatchObject({
      host: "::",
      port: 22
    });
    expect(parseQuickConnect("root@[::]:2222")).toMatchObject({
      host: "::",
      port: 2222
    });
  });

  it("parses IPv4-mapped and scoped IPv6 quick-connect targets", () => {
    expect(parseQuickConnect("ops@::ffff:192.0.2.10")).toMatchObject({
      host: "::ffff:192.0.2.10",
      port: 22,
    });
    expect(parseQuickConnect("ops@[fe80::1%eth0]:2200")).toMatchObject({
      host: "fe80::1%eth0",
      port: 2200,
    });
    expect(parseQuickConnect("ops@[fe80::1%25en0]:2200")).toMatchObject({
      host: "fe80::1%en0",
      port: 2200,
    });
  });

  it("rejects invalid quick-connect input", () => {
    expect(parseQuickConnect("example.com")).toBeNull();
    expect(parseQuickConnect("root@example.com:99999")).toBeNull();
    expect(parseQuickConnect("root@example.com:abc")).toBeNull();
    expect(parseQuickConnect("root@[example.com]:2200")).toBeNull();
    expect(parseQuickConnect("root@2001:db8::zz")).toBeNull();
    expect(parseQuickConnect("root@::::")).toBeNull();
    expect(parseQuickConnect("root@::ffff:999.0.2.10")).toBeNull();
    expect(parseQuickConnect("root@[fe80::1%eth 0]:2200")).toBeNull();
  });
});

describe("findPaletteMatches", () => {
  const hosts = [
    { name: "prod-web-01", host: "10.2.1.11", user: "deploy", tags: ["nginx"] },
    { name: "db", host: "10.2.2.5", user: "dba", tags: ["mysql"] },
  ];

  it("matches name, host, user@host and tags", () => {
    expect(findPaletteMatches(hosts, "prod").map(h => h.name)).toEqual(["prod-web-01"]);
    expect(findPaletteMatches(hosts, "dba@10.2.2.5").map(h => h.name)).toEqual(["db"]);
    expect(findPaletteMatches(hosts, "mysql").map(h => h.name)).toEqual(["db"]);
  });

  it("matches formatted targets with ports and bracketed IPv6 hosts", () => {
    const matches = [
      { name: "v6", host: "2001:db8::1", user: "ops", port: 2200, tags: [] },
      { name: "admin", host: "192.168.1.10", user: "root", port: 2222, tags: [] },
    ];

    expect(findPaletteMatches(matches, "ops@[2001:db8::1]:2200").map(h => h.name)).toEqual(["v6"]);
    expect(findPaletteMatches(matches, "root@192.168.1.10:2222").map(h => h.name)).toEqual(["admin"]);
  });

  it("tolerates sparse host records while searching", () => {
    const sparse = [
      { name: "legacy", host: "10.0.0.5", user: "deploy" },
      { host: "10.0.0.6", tags: "not-array" },
    ];

    expect(findPaletteMatches(sparse, "legacy").map(h => h.host)).toEqual(["10.0.0.5"]);
    expect(findPaletteMatches(sparse, "10.0.0.6").map(h => h.host)).toEqual(["10.0.0.6"]);
    expect(findPaletteMatches(null, "prod")).toEqual([]);
  });

  it("orders matches by host display priority before limiting results", () => {
    const matches = [
      { name: "offline-favorite", host: "10.0.0.1", user: "deploy", tags: ["prod"], fav: true, status: "offline" },
      { name: "online-normal", host: "10.0.0.2", user: "deploy", tags: ["prod"], fav: false, status: "online" },
      { name: "busy-favorite", host: "10.0.0.3", user: "deploy", tags: ["prod"], fav: true, status: "busy" },
      { name: "online-favorite", host: "10.0.0.4", user: "deploy", tags: ["prod"], fav: true, status: "online" },
    ];

    expect(findPaletteMatches(matches, "prod").map(host => host.name)).toEqual([
      "online-favorite",
      "busy-favorite",
      "offline-favorite",
      "online-normal",
    ]);
  });
});

describe("buildPaletteResults", () => {
  it("does not add a temporary quick-connect row when the saved host exists outside limited matches", () => {
    const exactQuery = "deploy@prod.example.com";
    const hosts = [
      { id: "fav-1", name: "prod-a", host: "10.0.0.1", user: "deploy", tags: [exactQuery], fav: true, status: "online" },
      { id: "fav-2", name: "prod-b", host: "10.0.0.2", user: "deploy", tags: [exactQuery], fav: true, status: "online" },
      { id: "fav-3", name: "prod-c", host: "10.0.0.3", user: "deploy", tags: [exactQuery], fav: true, status: "online" },
      { id: "fav-4", name: "prod-d", host: "10.0.0.4", user: "deploy", tags: [exactQuery], fav: true, status: "online" },
      { id: "fav-5", name: "prod-e", host: "10.0.0.5", user: "deploy", tags: [exactQuery], fav: true, status: "online" },
      { id: "saved", name: "prod-target", host: "prod.example.com", user: "deploy", tags: ["prod"], fav: false, status: "offline" },
    ];

    const results = buildPaletteResults(hosts, exactQuery);

    expect(results[0]).toMatchObject({ id: "saved" });
    expect(results[0]).not.toHaveProperty("temporary");
    expect(results.some(host => host.temporary)).toBe(false);
  });

  it("adds a temporary quick-connect row only when no saved target matches", () => {
    const results = buildPaletteResults([
      { id: "saved", name: "prod", host: "prod.example.com", user: "deploy", tags: ["prod"], status: "online" },
    ], "root@new.example.com:2200");

    expect(results[0]).toMatchObject({
      temporary: true,
      user: "root",
      host: "new.example.com",
      port: 2200,
    });
  });

  it("matches saved bracketed IPv6 hosts against quick-connect IPv6 targets", () => {
    const results = buildPaletteResults([
      { id: "saved-v6", name: "v6", host: "[2001:db8::1]", user: "ops", port: 2200, tags: [], status: "online" },
    ], "ops@[2001:db8::1]:2200");

    expect(results[0]).toMatchObject({ id: "saved-v6" });
    expect(results.some(host => host.temporary)).toBe(false);
  });

  it("keeps other sparse id-less matches after promoting an exact saved target", () => {
    const exact = { name: "exact", host: "prod.example.com", user: "deploy", tags: ["prod"], status: "online" };
    const sibling = { name: "sibling", host: "10.0.0.9", user: "deploy", tags: ["deploy@prod.example.com"], status: "online" };

    expect(buildPaletteResults([exact, sibling], "deploy@prod.example.com").map(host => host.name))
      .toEqual(["exact", "sibling"]);
  });
});

describe("formatUserHostPort", () => {
  it("formats palette targets with ports and bracketed IPv6 hosts", () => {
    expect(formatUserHostPort({ user: "root", host: "192.168.1.10", port: 2222 }))
      .toBe("root@192.168.1.10:2222");
    expect(formatUserHostPort({ user: "ops", host: "2001:db8::1", port: 2200 }))
      .toBe("ops@[2001:db8::1]:2200");
    expect(formatUserHostPort({ user: "ops", host: "fe80::1%eth0", port: 2200 }))
      .toBe("ops@[fe80::1%eth0]:2200");
    expect(formatUserHostPort({ user: "deploy", host: "example.com", port: 22 }))
      .toBe("deploy@example.com");
    expect(formatUserHostPort({ host: "2001:db8::2", port: 2022 }))
      .toBe("[2001:db8::2]:2022");
  });
});
