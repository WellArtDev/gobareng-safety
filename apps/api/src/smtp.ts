// Pengirim email lewat SMTP relay Brevo (port 587, STARTTLS).
// Dipakai untuk kanal email notifikasi; SMS dan WhatsApp Brevo
// tetap lewat REST API (brevo.ts) karena SMTP relay hanya email.
// Fail-soft seperti sender lain: env tidak di-set = kirim dilewati
// (false), tidak pernah throw. Kunci HANYA dari env var VPS,
// tidak pernah ditulis di repo, file, atau log.
// Transport di-inject di tes supaya tidak ada koneksi jaringan asli.
import net from "node:net";
import tls from "node:tls";
import { config } from "./config.js";

export function smtpEmailConfigured(senderEmail?: string): boolean {
  return Boolean(
    config.brevoSmtpUser &&
      config.brevoSmtpPass &&
      (senderEmail ?? config.brevoSenderEmail),
  );
}

export interface SmtpTransport {
  command(cmd: string): Promise<string>;
  sendData(data: string): Promise<string>;
  close(): void;
}

function expectCode(res: string, codes: number[]): void {
  const code = Number(res.slice(0, 3));
  if (!codes.includes(code)) throw new Error(`SMTP unexpected response: ${res}`);
}

class LineReader {
  private buffer = "";
  private lines: string[] = [];
  private waiters: Array<(line: string) => void> = [];
  private error: Error | null = null;

  constructor(private socket: { on(event: string, cb: (...args: unknown[]) => void): void }) {
    socket.on("data", (chunk) => {
      this.buffer += String(chunk);
      let idx: number;
      while ((idx = this.buffer.indexOf("\r\n")) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        const waiter = this.waiters.shift();
        if (waiter) waiter(line);
        else this.lines.push(line);
      }
    });
    socket.on("error", (e) => {
      this.error = e as Error;
      const waiters = this.waiters.splice(0);
      for (const w of waiters) w("");
    });
  }

  readLine(timeoutMs = 10000): Promise<string> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(resolve);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("SMTP read timeout"));
      }, timeoutMs);
      this.waiters.push((line) => {
        clearTimeout(timer);
        if (this.error) reject(this.error);
        else resolve(line);
      });
    });
  }
}

class RealSmtpTransport implements SmtpTransport {
  private socket: net.Socket;
  private reader: LineReader;

  private constructor(socket: net.Socket, reader: LineReader) {
    this.socket = socket;
    this.reader = reader;
  }

  static async connect(host: string, port: number, user: string, pass: string): Promise<RealSmtpTransport> {
    const socket = net.connect(port, host);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    let reader = new LineReader(socket);
    let res = await reader.readLine();
    expectCode(res, [220]);
    res = await this.send(socket, reader, `EHLO gobareng`);
    expectCode(res, [250]);
    if (port === 587) {
      res = await this.send(socket, reader, "STARTTLS");
      expectCode(res, [220]);
      const secure = tls.connect({ socket, servername: host });
      await new Promise<void>((resolve, reject) => {
        secure.once("secureConnect", resolve);
        secure.once("error", reject);
      });
      reader = new LineReader(secure);
      res = await this.send(secure, reader, `EHLO gobareng`);
      expectCode(res, [250]);
      const transport = new RealSmtpTransport(secure as unknown as net.Socket, reader);
      await transport.auth(user, pass);
      return transport;
    }
    const transport = new RealSmtpTransport(socket, reader);
    await transport.auth(user, pass);
    return transport;
  }

  private static async send(
    socket: { write(data: string): void },
    reader: LineReader,
    cmd: string,
  ): Promise<string> {
    socket.write(`${cmd}\r\n`);
    // Respons multi-baris SMTP (250-...) dibaca sampai baris penutup.
    let line = await reader.readLine();
    while (/^\d{3}-/.test(line)) {
      line = await reader.readLine();
    }
    return line;
  }

  private async auth(user: string, pass: string): Promise<void> {
    let res = await (this.constructor as typeof RealSmtpTransport).send(
      this.socket,
      this.reader,
      "AUTH LOGIN",
    );
    expectCode(res, [334]);
    res = await (this.constructor as typeof RealSmtpTransport).send(
      this.socket,
      this.reader,
      Buffer.from(user).toString("base64"),
    );
    expectCode(res, [334]);
    res = await (this.constructor as typeof RealSmtpTransport).send(
      this.socket,
      this.reader,
      Buffer.from(pass).toString("base64"),
    );
    expectCode(res, [235]);
  }

  async command(cmd: string): Promise<string> {
    return RealSmtpTransport.send(this.socket, this.reader, cmd);
  }

  async sendData(data: string): Promise<string> {
    this.socket.write(`${data}\r\n.\r\n`);
    let line = await this.reader.readLine();
    while (/^\d{3}-/.test(line)) {
      line = await this.reader.readLine();
    }
    return line;
  }

  close(): void {
    try {
      this.socket.destroy();
    } catch {
      // abaikan
    }
  }
}

function dotStuff(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export async function sendSmtpEmailWithTransport(
  transport: SmtpTransport,
  toEmail: string,
  subject: string,
  textContent: string,
  senderEmail?: string,
): Promise<boolean> {
  try {
    const sender = senderEmail ?? config.brevoSenderEmail;
    const fromName = config.brevoSenderName;
    let res = await transport.command(`MAIL FROM:<${sender}>`);
    expectCode(res, [250]);
    res = await transport.command(`RCPT TO:<${toEmail}>`);
    expectCode(res, [250, 251]);
    res = await transport.command("DATA");
    expectCode(res, [354]);
    const message =
      `From: ${fromName} <${sender}>\r\n` +
      `To: <${toEmail}>\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `\r\n` +
      dotStuff(textContent);
    res = await transport.sendData(message);
    expectCode(res, [250]);
    try {
      await transport.command("QUIT");
    } catch {
      // QUIT gagal tidak membatalkan pengiriman yang sudah 250.
    }
    return true;
  } catch (e) {
    console.warn(`[smtp] send error: ${(e as Error).message}`);
    return false;
  } finally {
    transport.close();
  }
}

export async function sendSmtpEmail(
  toEmail: string,
  subject: string,
  textContent: string,
  senderEmail?: string,
): Promise<boolean> {
  if (!smtpEmailConfigured(senderEmail)) return false;
  let transport: SmtpTransport;
  try {
    transport = await RealSmtpTransport.connect(
      config.brevoSmtpHost,
      config.brevoSmtpPort,
      config.brevoSmtpUser,
      config.brevoSmtpPass,
    );
  } catch (e) {
    console.warn(`[smtp] connect error: ${(e as Error).message}`);
    return false;
  }
  return sendSmtpEmailWithTransport(transport, toEmail, subject, textContent, senderEmail);
}
