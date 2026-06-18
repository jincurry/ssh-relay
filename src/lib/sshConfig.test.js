import { describe, expect, it } from "vitest";
import { mergeImportedHosts, parseSshConfig } from "./sshConfig.js";

describe("parseSshConfig", () => {
  it("imports concrete Host sections with common OpenSSH options", () => {
    const hosts = parseSshConfig(`
      Host prod-web-01
        HostName 10.2.1.11
        User deploy
        Port 2222
        IdentityFile ~/.ssh/prod_ed25519
        ProxyJump bastion-sh,relay-db
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "prod-web-01",
      host: "10.2.1.11",
      user: "deploy",
      port: 2222,
      group: "SSH Config",
      tags: ["ssh-config", "key", ":2222"],
      chain: ["bastion-sh", "relay-db"],
      identityFile: "~/.ssh/prod_ed25519"
    });
  });

  it("skips wildcard and negated host patterns but imports aliases from the same section", () => {
    const hosts = parseSshConfig(`
      Host * !blocked staging-api
        User ubuntu
        HostName 192.168.3.40
    `);

    expect(hosts.map(h => h.name)).toEqual(["staging-api"]);
  });

  it("preserves quoted ProxyCommand values and marks proxy hosts", () => {
    const hosts = parseSshConfig(`
      Host db-master
        HostName 10.2.2.5 # inline comments are ignored
        User dba
        ProxyCommand "nc -X 5 -x 127.0.0.1:1080 %h %p"
    `);

    expect(hosts[0].proxy).toEqual({
      type: "cmd",
      cmd: "nc -X 5 -x 127.0.0.1:1080 %h %p"
    });
    expect(hosts[0].tags).toContain("proxy");
  });

  it("imports OpenSSH keyword=value directives with optional spaces around equals", () => {
    const hosts = parseSshConfig(`
      Host=eq-host
        HostName=10.3.0.5
        User= deploy
        Port = 2200
        IdentityFile=~/.ssh/eq_ed25519
        ProxyJump = bastion-eq,relay-eq
        ProxyCommand= "ssh -W %h:%p jump"
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "eq-host",
      host: "10.3.0.5",
      user: "deploy",
      port: 2200,
      identityFile: "~/.ssh/eq_ed25519",
      chain: ["bastion-eq", "relay-eq"],
    });
    expect(hosts[0].proxy).toBeUndefined();
    expect(hosts[0].tags).toEqual(["ssh-config", "key", ":2200"]);
  });

  it("unescapes OpenSSH config words without corrupting Windows paths", () => {
    const hosts = parseSshConfig(`
      Host escaped-key
        HostName host\\#blue.internal
        User deploy
        IdentityFile ~/.ssh/prod\\ key
        ProxyCommand ssh -i C:\\Users\\deploy\\.ssh\\jump\\ key -W %h:%p jump\\ host

      Host windows-key
        HostName 10.3.0.6
        User deploy
        IdentityFile C:\\Users\\deploy\\.ssh\\id_ed25519
    `);

    expect(hosts[0]).toMatchObject({
      name: "escaped-key",
      host: "host#blue.internal",
      identityFile: "~/.ssh/prod key",
      proxy: {
        type: "cmd",
        cmd: "ssh -i C:\\Users\\deploy\\.ssh\\jump key -W %h:%p jump host",
      },
    });
    expect(hosts[1]).toMatchObject({
      name: "windows-key",
      identityFile: "C:\\Users\\deploy\\.ssh\\id_ed25519",
    });
  });

  it("normalizes bracketed IPv6 HostName values during import", () => {
    const hosts = parseSshConfig(`
      Host prod-v6
        HostName [2001:db8::10]
        User deploy
        Port 2200
    `);

    expect(hosts[0]).toMatchObject({
      name: "prod-v6",
      host: "2001:db8::10",
      user: "deploy",
      port: 2200,
    });
  });

  it("keeps target ProxyJump mutually exclusive with target ProxyCommand", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName 10.2.1.11
        User deploy
        ProxyJump bastion-sh
        ProxyCommand "ssh -W %h:%p old-bastion"

      Host bastion-sh
        HostName 203.0.113.10
        User ops
        ProxyCommand "nc -x 127.0.0.1:1080 %h %p"
    `);

    expect(hosts[0]).toMatchObject({
      name: "prod-web",
      chain: ["bastion-sh"],
      jumpHosts: [
        expect.objectContaining({
          name: "bastion-sh",
          proxy: { type: "cmd", cmd: "nc -x 127.0.0.1:1080 %h %p" },
        }),
      ],
    });
    expect(hosts[0].proxy).toBeUndefined();
    expect(hosts[0].tags).not.toContain("proxy");
  });

  it("expands OpenSSH HostName tokens without changing ProxyCommand placeholders", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName edge-%h-%n-%r-%p
        User deploy
        Port 2200
        ProxyCommand "ssh -W %h:%p bastion"
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      host: "edge-prod-web-prod-web-deploy-2200",
      proxy: { type: "cmd", cmd: "ssh -W %h:%p bastion" },
    });
  });

  it("expands HostName tokens for structured ProxyJump aliases", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName 10.2.1.11
        User deploy
        ProxyJump ops@bastion-sh

      Host bastion-*
        HostName %h.internal
        Port 2201
    `);

    expect(hosts[0].jumpHosts).toEqual([
      expect.objectContaining({
        name: "bastion-sh",
        host: "bastion-sh.internal",
        user: "ops",
        port: 2201,
      }),
    ]);
  });

  it("normalizes bracketed IPv6 HostName values for structured ProxyJump aliases", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName 10.2.1.11
        User deploy
        ProxyJump relay-v6

      Host relay-v6
        HostName [2001:db8::20]
        User ops
    `);

    expect(hosts[0].jumpHosts).toEqual([
      expect.objectContaining({
        name: "relay-v6",
        host: "2001:db8::20",
        user: "ops",
      }),
    ]);
  });

  it("applies matching Host wildcard defaults to imported concrete aliases", () => {
    const hosts = parseSshConfig(`
      Host prod-web-01
        HostName 10.2.1.11

      Host *
        User deploy
        Port 2200
        IdentityFile ~/.ssh/default_ed25519
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "prod-web-01",
      host: "10.2.1.11",
      user: "deploy",
      port: 2200,
      identityFile: "~/.ssh/default_ed25519",
      tags: ["ssh-config", "key", ":2200"],
    });
  });

  it("applies global options before the first Host as OpenSSH defaults", () => {
    const hosts = parseSshConfig(`
      User ops
      Port 2201
      IdentityFile ~/.ssh/global_ed25519

      Host prod-web-01
        HostName 10.2.1.11
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "prod-web-01",
      host: "10.2.1.11",
      user: "ops",
      port: 2201,
      identityFile: "~/.ssh/global_ed25519",
      tags: ["ssh-config", "key", ":2201"],
    });
  });

  it("does not leak Match block directives into the previous Host", () => {
    const hosts = parseSshConfig(`
      Host prod-web-01
        HostName 10.2.1.11

      Match exec "test -f ~/.ssh/use-ci"
        User ci
        Port 2022
        IdentityFile ~/.ssh/ci

      Host prod-web-02
        HostName 10.2.1.12
        User deploy
    `);

    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toMatchObject({
      name: "prod-web-01",
      host: "10.2.1.11",
      user: expect.any(String),
      port: 22,
    });
    expect(hosts[0].user).not.toBe("ci");
    expect(hosts[0].identityFile).toBeUndefined();
    expect(hosts[1]).toMatchObject({
      name: "prod-web-02",
      host: "10.2.1.12",
      user: "deploy",
      port: 22,
    });
  });

  it("keeps earlier concrete options ahead of later wildcard defaults and honors negated patterns", () => {
    const hosts = parseSshConfig(`
      Host prod-db-01
        User dba

      Host prod-*
        Port 2200
        ProxyJump bastion-prod

      Host * !prod-db-01
        User deploy
        IdentityFile ~/.ssh/default_ed25519
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({
      name: "prod-db-01",
      host: "prod-db-01",
      user: "dba",
      port: 2200,
      chain: ["bastion-prod"],
    });
    expect(hosts[0].identityFile).toBeUndefined();
  });

  it("treats ProxyCommand none as an explicit disabled proxy command", () => {
    const hosts = parseSshConfig(`
      Host direct-host
        ProxyCommand none

      Host *
        ProxyCommand "ssh -W %h:%p bastion"
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].proxy).toBeUndefined();
    expect(hosts[0].tags).toEqual(["ssh-config"]);
  });

  it("preserves structured ProxyJump targets for SSH authentication", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName 10.2.1.11
        User deploy
        ProxyJump ops@bastion-sh:2222,relay-db

      Host bastion-*
        HostName 203.0.113.10
        User jump-default
        Port 2201
        IdentityFile ~/.ssh/bastion
        ProxyCommand "nc -x 127.0.0.1:1080 %h %p"

      Host relay-db
        HostName 192.0.2.7
        User relay
        Port 2022
        IdentityFile ~/.ssh/relay
    `);

    const prod = hosts.find(host => host.name === "prod-web");

    expect(prod).toMatchObject({
      chain: ["bastion-sh", "relay-db"],
      jumpHosts: [
        {
          name: "bastion-sh",
          host: "203.0.113.10",
          user: "ops",
          port: 2222,
          identityFile: "~/.ssh/bastion",
          proxy: { type: "cmd", cmd: "nc -x 127.0.0.1:1080 %h %p" },
        },
        {
          name: "relay-db",
          host: "192.0.2.7",
          user: "relay",
          port: 2022,
          identityFile: "~/.ssh/relay",
        },
      ],
    });
  });

  it("imports OpenSSH forwarding directives as enabled GUI rules", () => {
    const hosts = parseSshConfig(`
      Host tunnel-host
        HostName 10.2.1.11
        User deploy
        LocalForward 15432 db.internal:5432
        RemoteForward 18080 127.0.0.1:8080
        DynamicForward 1086
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].tags).toContain("forward");
    expect(hosts[0].forwards).toEqual([
      {
        id: "import-tunnel-host-L-1",
        type: "L",
        lport: "15432",
        rhost: "db.internal",
        rport: "5432",
        on: true,
      },
      {
        id: "import-tunnel-host-R-2",
        type: "R",
        lport: "8080",
        rhost: "127.0.0.1",
        rport: "18080",
        on: true,
      },
      {
        id: "import-tunnel-host-D-3",
        type: "D",
        lport: "1086",
        rhost: "",
        rport: "",
        on: true,
      },
    ]);
  });

  it("imports StrictHostKeyChecking policies for targets and jump hosts", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        HostName 10.2.1.11
        User deploy
        StrictHostKeyChecking accept-new
        ConnectTimeout 5
        ServerAliveInterval 15
        ServerAliveCountMax 4
        ProxyJump bastion-sh

      Host bastion-sh
        HostName 203.0.113.10
        User ops
        StrictHostKeyChecking no
        ConnectTimeout 7
        ServerAliveInterval 20
        ServerAliveCountMax 2
    `);

    expect(hosts[0]).toMatchObject({
      name: "prod-web",
      strictHostKey: true,
      trustUnknownHostKey: true,
      connectTimeoutMs: 5000,
      serverAliveIntervalMs: 15000,
      serverAliveCountMax: 4,
      tags: expect.arrayContaining(["host-key", "timeout", "keepalive"]),
      jumpHosts: [
        expect.objectContaining({
          name: "bastion-sh",
          strictHostKey: false,
          trustUnknownHostKey: true,
          connectTimeoutMs: 7000,
          serverAliveIntervalMs: 20000,
          serverAliveCountMax: 2,
        }),
      ],
    });
  });

  it("imports compact forwarding directives with bind addresses and bracketed IPv6 targets", () => {
    const hosts = parseSshConfig(`
      Host compact-tunnel
        LocalForward 127.0.0.1:15432:[2001:db8::20]:5432
        RemoteForward [::1]:18080:localhost:8080
        DynamicForward [::1]:1086
    `);

    expect(hosts[0].forwards).toEqual([
      {
        id: "import-compact-tunnel-L-1",
        type: "L",
        lport: "15432",
        rhost: "2001:db8::20",
        rport: "5432",
        on: true,
      },
      {
        id: "import-compact-tunnel-R-2",
        type: "R",
        lport: "8080",
        rhost: "localhost",
        rport: "18080",
        on: true,
      },
      {
        id: "import-compact-tunnel-D-3",
        type: "D",
        lport: "1086",
        rhost: "",
        rport: "",
        on: true,
      },
    ]);
  });

  it("merges forwarding directives from every matching Host section", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        LocalForward 15432 db.internal:5432

      Host prod-*
        RemoteForward 18080 127.0.0.1:8080

      Host *
        DynamicForward 1086
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].tags).toContain("forward");
    expect(hosts[0].forwards).toEqual([
      {
        id: "import-prod-web-L-1",
        type: "L",
        lport: "15432",
        rhost: "db.internal",
        rport: "5432",
        on: true,
      },
      {
        id: "import-prod-web-R-2",
        type: "R",
        lport: "8080",
        rhost: "127.0.0.1",
        rport: "18080",
        on: true,
      },
      {
        id: "import-prod-web-D-3",
        type: "D",
        lport: "1086",
        rhost: "",
        rport: "",
        on: true,
      },
    ]);
  });

  it("honors ClearAllForwardings when importing matched forwarding directives", () => {
    const hosts = parseSshConfig(`
      Host prod-web
        ClearAllForwardings yes
        LocalForward 15432 db.internal:5432

      Host prod-*
        RemoteForward 18080 127.0.0.1:8080

      Host *
        DynamicForward 1086
    `);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].forwards).toBeUndefined();
    expect(hosts[0].tags).not.toContain("forward");
  });
});

describe("mergeImportedHosts", () => {
  it("deduplicates imported hosts and assigns numeric ids after existing hosts", () => {
    const existing = [
      { id: 5, name: "prod-web-01", user: "deploy", host: "10.2.1.11", port: 22 }
    ];
    const imported = [
      { id: "a", name: "prod-web-01", user: "deploy", host: "10.2.1.11", port: 22 },
      { id: "b", name: "new-host", user: "root", host: "10.9.0.8", port: 22 }
    ];

    expect(mergeImportedHosts(existing, imported)).toEqual([
      existing[0],
      { id: 6, name: "new-host", user: "root", host: "10.9.0.8", port: 22 }
    ]);
  });

  it("deduplicates imported hosts case-insensitively against existing hosts", () => {
    const existing = [
      { id: 5, name: "prod-web-01", user: "deploy", host: "10.2.1.11", port: 22 }
    ];
    const imported = [
      { id: "a", name: "PROD-WEB-01", user: "DEPLOY", host: "10.2.1.11", port: "22" },
      { id: "b", name: "new-host", user: "root", host: "10.9.0.8", port: 22 }
    ];

    expect(mergeImportedHosts(existing, imported)).toEqual([
      existing[0],
      { id: 6, name: "new-host", user: "root", host: "10.9.0.8", port: 22 }
    ]);
  });

  it("deduplicates case-only duplicates within one imported batch", () => {
    const imported = [
      { id: "a", name: "prod-web-01", user: "deploy", host: "10.2.1.11", port: 22 },
      { id: "b", name: "PROD-WEB-01", user: "DEPLOY", host: "10.2.1.11", port: "22" }
    ];

    expect(mergeImportedHosts([], imported)).toEqual([
      { id: 1, name: "prod-web-01", user: "deploy", host: "10.2.1.11", port: 22 }
    ]);
  });

  it("deduplicates bracketed and unbracketed IPv6 imports", () => {
    const existing = [
      { id: 5, name: "prod-v6", user: "deploy", host: "2001:db8::10", port: 2200 }
    ];
    const imported = [
      { id: "a", name: "prod-v6", user: "deploy", host: "[2001:db8::10]", port: "2200" },
      { id: "b", name: "relay-v6", user: "ops", host: "[2001:db8::20]", port: 22 }
    ];

    expect(mergeImportedHosts(existing, imported)).toEqual([
      existing[0],
      { id: 6, name: "relay-v6", user: "ops", host: "2001:db8::20", port: 22 }
    ]);
  });
});
