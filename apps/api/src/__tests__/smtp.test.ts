// Unit: SMTP relay Brevo fail-soft + alur MAIL/RCPT/DATA.
// Tidak menyentuh jaringan asli: transport di-fake; env tes tidak
// punya SMTP user/pass sehingga smtpEmailConfigured() = false.
import { describe, expect, test } from "bun:test";
import {
  sendSmtpEmail,
  sendSmtpEmailWithTransport,
  smtpEmailConfigured,
  type SmtpTransport,
} from "../smtp.js";

function fakeTransport(opts?: { failAt?: string }): {
  transport: SmtpTransport;
  commands: string[];
  data: string[];
} {
  const commands: string[] = [];
  const data: string[] = [];
  const transport: SmtpTransport = {
    async command(cmd: string) {
      commands.push(cmd);
      if (opts?.failAt === cmd) return "550 rejected";
      if (cmd === "DATA") return "354 go ahead";
      return "250 OK";
    },
    async sendData(d: string) {
      data.push(d);
      return "250 queued";
    },
    close() {},
  };
  return { transport, commands, data };
}

describe("smtp fail-soft", () => {
  test("tanpa SMTP user/pass: configured false, kirim false tanpa jaringan", async () => {
    expect(smtpEmailConfigured()).toBe(false);
    expect(await sendSmtpEmail("a@b.test", "x", "y")).toBe(false);
  });

  test("transport fake: MAIL, RCPT, DATA, pesan, QUIT", async () => {
    const { transport, commands, data } = fakeTransport();
    const ok = await sendSmtpEmailWithTransport(transport, "a@b.test", "Halo", "isi pesan");
    expect(ok).toBe(true);
    expect(commands[0]).toBe("MAIL FROM:<>");
    expect(commands[1]).toBe("RCPT TO:<a@b.test>");
    expect(commands[2]).toBe("DATA");
    expect(commands[commands.length - 1]).toBe("QUIT");
    expect(data[0]).toContain("Subject: Halo");
    expect(data[0]).toContain("isi pesan");
  });

  test("RCPT ditolak: kirim false tanpa throw", async () => {
    const { transport } = fakeTransport({ failAt: "RCPT TO:<a@b.test>" });
    const ok = await sendSmtpEmailWithTransport(transport, "a@b.test", "x", "y");
    expect(ok).toBe(false);
  });
});
