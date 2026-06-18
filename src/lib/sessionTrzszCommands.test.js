import { describe, expect, it } from "vitest";
import { buildSessionTrzszPreviewPlan } from "./sessionTrzszCommands.js";

describe("sessionTrzszCommands", () => {
  it("builds a preview upload plan for trz commands", () => {
    expect(buildSessionTrzszPreviewPlan(" trz ")).toEqual({
      direction: "up",
      commandText: "trz",
      fileName: "dist.tar.gz",
      size: 12 * 1024 * 1024,
      splitMessage: "拆分会话 trz 上传等待中",
    });

    expect(buildSessionTrzszPreviewPlan("trz -d", {
      uploadName: "bundle.tar.gz",
      uploadSize: 1024,
    })).toMatchObject({
      direction: "up",
      commandText: "trz -d",
      fileName: "bundle.tar.gz",
      size: 1024,
    });
  });

  it("builds a preview download plan from tsz filenames", () => {
    expect(buildSessionTrzszPreviewPlan("tsz access.log")).toMatchObject({
      direction: "down",
      commandText: "tsz access.log",
      fileName: "access.log",
      size: 240 * 1024 * 1024,
      splitMessage: "拆分会话 tsz 下载等待中",
    });

    expect(buildSessionTrzszPreviewPlan("tsz --binary \"access log.txt\"")).toMatchObject({
      direction: "down",
      fileName: "access log.txt",
    });

    expect(buildSessionTrzszPreviewPlan("tsz './release candidate.tar.gz'")).toMatchObject({
      direction: "down",
      fileName: "./release candidate.tar.gz",
    });
  });

  it("ignores tsz without a concrete file target", () => {
    expect(buildSessionTrzszPreviewPlan("tsz")).toBeNull();
    expect(buildSessionTrzszPreviewPlan("tsz   --binary")).toBeNull();
  });

  it("ignores unrelated commands and normalizes invalid sizes", () => {
    expect(buildSessionTrzszPreviewPlan("echo trz")).toBeNull();
    expect(buildSessionTrzszPreviewPlan("tsz report.txt", { downloadSize: -1 })).toMatchObject({
      fileName: "report.txt",
      size: 240 * 1024 * 1024,
    });
  });
});
