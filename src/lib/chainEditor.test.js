import { describe, expect, it } from "vitest";
import { appendUniqueChainNode, buildChainHopActionDisplay, removeChainNode, reorderChainByDrag } from "./chainEditor.js";

describe("chainEditor", () => {
  it("reorders hops from left to right", () => {
    expect(reorderChainByDrag(["bastion-a", "relay-b", "bastion-c"], 0, 2)).toEqual([
      "relay-b",
      "bastion-c",
      "bastion-a",
    ]);
  });

  it("reorders hops from right to left", () => {
    expect(reorderChainByDrag(["bastion-a", "relay-b", "bastion-c"], 2, 0)).toEqual([
      "bastion-c",
      "bastion-a",
      "relay-b",
    ]);
  });

  it("returns a copy for invalid drag indexes", () => {
    const chain = ["bastion-a", "relay-b"];
    const next = reorderChainByDrag(chain, -1, 1);

    expect(next).toEqual(chain);
    expect(next).not.toBe(chain);
    expect(reorderChainByDrag(chain, 0, 9)).toEqual(chain);
    expect(reorderChainByDrag(chain, "x", 1)).toEqual(chain);
  });

  it("removes a hop by index", () => {
    expect(removeChainNode(["bastion-a", "relay-b", "bastion-c"], 1)).toEqual([
      "bastion-a",
      "bastion-c",
    ]);
    expect(removeChainNode(["bastion-a"], 4)).toEqual(["bastion-a"]);
  });

  it("appends only unique non-empty hops", () => {
    expect(appendUniqueChainNode(["bastion-a"], "relay-b")).toEqual(["bastion-a", "relay-b"]);
    expect(appendUniqueChainNode(["bastion-a"], "bastion-a")).toEqual(["bastion-a"]);
    expect(appendUniqueChainNode(["bastion-a"], " ")).toEqual(["bastion-a"]);
  });

  it("builds hop action display states for edge and middle nodes", () => {
    expect(buildChainHopActionDisplay({ index: 0, total: 3 })).toMatchObject({
      moveLeft: { enabled: false, title: "已是第一跳", opacity: 0.45, cursor: "not-allowed" },
      moveRight: { enabled: true, title: "右移跳板", opacity: 1, cursor: "pointer" },
      remove: { enabled: true, title: "移除跳板", opacity: 1, cursor: "pointer" },
    });

    expect(buildChainHopActionDisplay({ index: 1, total: 3 })).toMatchObject({
      moveLeft: { enabled: true, title: "左移跳板" },
      moveRight: { enabled: true, title: "右移跳板" },
    });

    expect(buildChainHopActionDisplay({ index: 2, total: 3 })).toMatchObject({
      moveLeft: { enabled: true, title: "左移跳板" },
      moveRight: { enabled: false, title: "已是最后一跳", opacity: 0.45, cursor: "not-allowed" },
    });
  });

  it("disables hop actions for invalid indexes", () => {
    expect(buildChainHopActionDisplay({ index: "x", total: 2 })).toMatchObject({
      moveLeft: { enabled: false, cursor: "not-allowed" },
      moveRight: { enabled: false, cursor: "not-allowed" },
      remove: { enabled: false, cursor: "not-allowed" },
    });
  });
});
