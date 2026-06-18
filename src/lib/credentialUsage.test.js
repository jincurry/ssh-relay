import { describe, expect, it } from "vitest";
import { attachCredentialUsage, credentialMatchKeys, findCredentialHosts } from "./credentialUsage.js";

const hosts = [
  { id: 1, name: "prod-web", user: "deploy", host: "10.0.0.1", identityFile: "~/.ssh/prod_ed25519" },
  { id: 2, name: "staging", user: "ubuntu", host: "10.0.0.2", identityFile: "/home/me/.ssh/staging_rsa" },
  { id: 3, name: "password-only", user: "root", host: "10.0.0.3" },
];

describe("credentialUsage", () => {
  it("matches hosts by credential basename when paths use different home forms", () => {
    const credential = {
      name: "prod_ed25519",
      privatePath: "/home/me/.ssh/prod_ed25519",
      path: "/home/me/.ssh/prod_ed25519.pub",
    };

    expect(findCredentialHosts(credential, hosts)).toEqual([
      { id: 1, name: "prod-web", user: "deploy", host: "10.0.0.1" },
    ]);
  });

  it("counts host profiles that use a credential through structured jump hosts", () => {
    const credential = {
      name: "bastion_ed25519",
      privatePath: "/home/me/.ssh/bastion_ed25519",
      path: "/home/me/.ssh/bastion_ed25519.pub",
    };
    const routedHosts = [
      ...hosts,
      {
        id: 4,
        name: "prod-db",
        user: "dba",
        host: "10.0.0.4",
        jumpHosts: [{ name: "bastion", host: "203.0.113.10", user: "ops", identityFile: "~/.ssh/bastion_ed25519" }],
      },
    ];

    expect(findCredentialHosts(credential, routedHosts)).toEqual([
      { id: 4, name: "prod-db", user: "dba", host: "10.0.0.4" },
    ]);
  });

  it("counts a host once when the same credential is used by target and jump hosts", () => {
    const [credential] = attachCredentialUsage([
      { name: "shared_ed25519", privatePath: "/home/me/.ssh/shared_ed25519", path: "/home/me/.ssh/shared_ed25519.pub" },
    ], [{
      id: 5,
      name: "shared-route",
      user: "deploy",
      host: "10.0.0.5",
      identityFile: "~/.ssh/shared_ed25519",
      jumpHosts: [{ name: "bastion", host: "203.0.113.10", user: "ops", identityFile: "~/.ssh/shared_ed25519" }],
    }]);

    expect(credential.used).toBe(1);
    expect(credential.usedHosts.map(host => host.name)).toEqual(["shared-route"]);
  });

  it("uses visible chain selection when counting structured jump-host key usage", () => {
    const credential = {
      name: "active_bastion",
      privatePath: "/home/me/.ssh/active_bastion",
      path: "/home/me/.ssh/active_bastion.pub",
    };
    const staleCredential = {
      name: "old_bastion",
      privatePath: "/home/me/.ssh/old_bastion",
      path: "/home/me/.ssh/old_bastion.pub",
    };
    const routedHosts = [{
      id: 6,
      name: "prod-api",
      user: "deploy",
      host: "10.0.0.6",
      chain: ["active-bastion"],
      jumpHosts: [{ name: "old-bastion", host: "old.example", user: "ops", identityFile: "~/.ssh/old_bastion" }],
    }];
    const knownHosts = [{ name: "active-bastion", host: "active.example", user: "ops", identityFile: "~/.ssh/active_bastion" }];

    expect(findCredentialHosts(staleCredential, routedHosts, knownHosts)).toEqual([]);
    expect(findCredentialHosts(credential, routedHosts, knownHosts)).toEqual([
      { id: 6, name: "prod-api", user: "deploy", host: "10.0.0.6" },
    ]);
  });

  it("keeps preview usage counts when no configured host references the credential", () => {
    const [credential] = attachCredentialUsage([
      { name: "preview-key", used: 5, privatePath: null, path: null },
    ], hosts);

    expect(credential.used).toBe(5);
    expect(credential.usedHosts).toEqual([]);
  });

  it("overrides stale usage counts with actual configured host references", () => {
    const [credential] = attachCredentialUsage([
      { name: "staging_rsa", used: 9, privatePath: "/home/me/.ssh/staging_rsa", path: "/home/me/.ssh/staging_rsa.pub" },
    ], hosts);

    expect(credential.used).toBe(1);
    expect(credential.usedHosts.map(host => host.name)).toEqual(["staging"]);
  });

  it("builds match keys from private path, public path, stripped public path, and name", () => {
    const keys = credentialMatchKeys({
      name: "id_ed25519",
      privatePath: "/home/me/.ssh/id_ed25519",
      path: "/home/me/.ssh/id_ed25519.pub",
    });

    expect(Array.from(keys)).toEqual(expect.arrayContaining([
      "id_ed25519",
      "/home/me/.ssh/id_ed25519",
      "/home/me/.ssh/id_ed25519.pub",
      "id_ed25519.pub",
    ]));
  });
});
