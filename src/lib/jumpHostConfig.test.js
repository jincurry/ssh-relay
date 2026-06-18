import { describe, expect, it } from "vitest";
import { buildEditableJumpHosts, finalizeJumpHostsForSave, patchEditableJumpHost, reconcileJumpHostsForChain } from "./jumpHostConfig.js";

describe("jumpHostConfig", () => {
  it("builds editable jump hosts from matching structured metadata", () => {
    const editable = buildEditableJumpHosts({
      host: {
        user: "deploy",
        chain: ["bastion-sh"],
        jumpHosts: [{
          name: "bastion-sh",
          host: "203.0.113.10",
          user: "ops",
          port: "2222",
          privateKeyPath: " ~/.ssh/bastion ",
          totpProfileId: "prod-2fa",
        }],
      },
    });

    expect(editable).toEqual([expect.objectContaining({
      name: "bastion-sh",
      host: "203.0.113.10",
      user: "ops",
      port: "2222",
      identityFile: "~/.ssh/bastion",
      totpProfileId: "prod-2fa",
    })]);
  });

  it("resolves new chain labels from known hosts and falls back to target user", () => {
    const editable = reconcileJumpHostsForChain(["bastion-bj", "relay-db"], {
      currentJumpHosts: [{ name: "old-bastion", host: "old.example", user: "old" }],
      knownHosts: [
        { name: "bastion-bj", host: "198.51.100.20", user: "ops", port: 2200, identityFile: "~/.ssh/bj" },
      ],
      fallbackUser: "deploy",
    });

    expect(editable).toEqual([
      expect.objectContaining({
        name: "bastion-bj",
        host: "198.51.100.20",
        user: "ops",
        port: "2200",
        identityFile: "~/.ssh/bj",
      }),
      expect.objectContaining({
        name: "relay-db",
        host: "relay-db",
        user: "deploy",
        port: "22",
      }),
    ]);
  });

  it("preserves edited jump host details when the chain is reordered", () => {
    const current = [
      { name: "bastion-sh", host: "203.0.113.10", user: "ops", port: "2222" },
      { name: "relay-db", host: "10.2.0.9", user: "relay", port: "22" },
    ];

    expect(reconcileJumpHostsForChain(["relay-db", "bastion-sh"], {
      currentJumpHosts: current,
      fallbackUser: "deploy",
    })).toEqual([
      expect.objectContaining({ name: "relay-db", host: "10.2.0.9", user: "relay" }),
      expect.objectContaining({ name: "bastion-sh", host: "203.0.113.10", user: "ops", port: "2222" }),
    ]);
  });

  it("patches a single editable jump host and normalizes save output", () => {
    const patched = patchEditableJumpHost([
      { name: "bastion", host: "bastion", user: "deploy", port: "22" },
    ], 0, {
      host: " bastion.internal ",
      user: " ops ",
      port: "70000",
      identityFile: [" ~/.ssh/bastion ", "~/.ssh/fallback"],
      totpProfileId: " prod-2fa ",
    });

    expect(finalizeJumpHostsForSave(["bastion"], patched, { fallbackUser: "deploy" })).toEqual([
      expect.objectContaining({
        name: "bastion",
        host: "bastion.internal",
        user: "ops",
        port: "22",
        identityFile: "~/.ssh/bastion",
        totpProfileId: "prod-2fa",
      }),
    ]);
  });

  it("returns undefined save metadata for a direct chain", () => {
    expect(finalizeJumpHostsForSave([], [{ name: "old", host: "old" }])).toBeUndefined();
  });
});
