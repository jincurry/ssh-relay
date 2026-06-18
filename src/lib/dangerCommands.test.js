import { describe, expect, it } from "vitest";
import { buildDangerConfirmation, detectDangerousCommand } from "./dangerCommands.js";

describe("dangerCommands", () => {
  it("flags recursive deletes against absolute or parent paths", () => {
    expect(detectDangerousCommand("sudo rm -rf /var/log/app").id).toBe("recursive-delete");
    expect(detectDangerousCommand("rm -fr ../release").id).toBe("recursive-delete");
    expect(detectDangerousCommand("rm -R /opt/app").id).toBe("recursive-delete");
    expect(detectDangerousCommand("rm -rf / --no-preserve-root").id).toBe("recursive-delete");
    expect(detectDangerousCommand("rm --recursive --force /srv/app").id).toBe("recursive-delete");
    expect(detectDangerousCommand("rm -rf ~/Downloads/cache --one-file-system").id).toBe("recursive-delete");
  });

  it("flags service restarts and system power commands", () => {
    expect(detectDangerousCommand("systemctl restart nginx").id).toBe("service-control");
    expect(detectDangerousCommand("service nginx stop").id).toBe("service-control");
    expect(detectDangerousCommand("sudo reboot now").id).toBe("system-power");
    expect(detectDangerousCommand("systemctl reboot --message maintenance").id).toBe("system-power");
    expect(detectDangerousCommand("sudo systemctl poweroff").id).toBe("system-power");
  });

  it("flags destructive disk and orchestrator operations", () => {
    expect(detectDangerousCommand("dd if=image.iso of=/dev/sda bs=4M").id).toBe("raw-device-write");
    expect(detectDangerousCommand("mkfs.ext4 /dev/nvme0n1").id).toBe("format-disk");
    expect(detectDangerousCommand("kubectl delete namespace prod").id).toBe("orchestrator-delete");
    expect(detectDangerousCommand("docker system prune -af").id).toBe("orchestrator-delete");
  });

  it("flags recursive permission changes against system-like paths anywhere in the arguments", () => {
    expect(detectDangerousCommand("chmod -R 777 / --preserve-root").id).toBe("permission-root");
    expect(detectDangerousCommand("chmod --recursive 777 /var/www --changes").id).toBe("permission-root");
    expect(detectDangerousCommand("chown -R deploy:deploy ~/app --from=root").id).toBe("permission-root");
    expect(detectDangerousCommand("chgrp -R staff ../release --verbose").id).toBe("permission-root");
  });

  it("flags dangerous commands wrapped in shell -c invocations", () => {
    expect(detectDangerousCommand("bash -lc 'sudo rm -rf /var/log/app'")).toMatchObject({
      id: "recursive-delete",
      segment: "rm -rf /var/log/app",
    });
    expect(detectDangerousCommand("/bin/sh -c \"systemctl restart nginx\"")).toMatchObject({
      id: "service-control",
      segment: "systemctl restart nginx",
    });
    expect(detectDangerousCommand("bash -lc 'systemctl suspend'")).toMatchObject({
      id: "system-power",
      segment: "systemctl suspend",
    });
  });

  it("keeps separators inside shell -c quotes before inspecting the wrapped command", () => {
    expect(detectDangerousCommand("bash -lc \"echo ok && sudo rm -rf /var/log/app\"")).toMatchObject({
      id: "recursive-delete",
      segment: "rm -rf /var/log/app",
    });
  });

  it("flags nested shell wrapper invocations", () => {
    expect(detectDangerousCommand("sudo bash -lc \"sh -c 'docker system prune -af'\"")).toMatchObject({
      id: "orchestrator-delete",
      segment: "docker system prune -af",
    });
  });

  it("ignores routine inspection commands", () => {
    expect(detectDangerousCommand("df -h").danger).toBe(false);
    expect(detectDangerousCommand("tail -f /var/log/syslog").danger).toBe(false);
    expect(detectDangerousCommand("rm -rf node_modules").danger).toBe(false);
    expect(detectDangerousCommand("rm -rf build --one-file-system").danger).toBe(false);
    expect(detectDangerousCommand("chmod -R 755 node_modules").danger).toBe(false);
    expect(detectDangerousCommand("chmod --recursive 755 build").danger).toBe(false);
    expect(detectDangerousCommand("echo 'sudo rm -rf /var/log/app'").danger).toBe(false);
  });

  it("builds a confirmation message with the matched segment", () => {
    const message = buildDangerConfirmation("cd /tmp && sudo systemctl restart nginx");
    expect(message).toContain("停止或重启服务");
    expect(message).toContain("systemctl restart nginx");
  });
});
