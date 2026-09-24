import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { AppConfig } from "../config/env";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const host = this.config.get("SMTP_HOST", { infer: true });
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: this.config.get("SMTP_PORT", { infer: true }),
          secure: this.config.get("SMTP_PORT", { infer: true }) === 465,
          auth: {
            user: this.config.get("SMTP_USER", { infer: true }),
            pass: this.config.get("SMTP_PASS", { infer: true }),
          },
        })
      : null;
  }

  async sendConfirmation(to: string, name: string, token: string) {
    const base = this.config.get("APP_PUBLIC_URL", { infer: true }).replace(/\/$/, "");
    const url = `${base}/api/auth/confirm?token=${encodeURIComponent(token)}`;
    const from = this.config.get("SMTP_FROM", { infer: true });
    const subject = "Confirm your One More Thing email";
    const text = `Hi ${name},\n\nConfirm your email to finish creating your account:\n${url}\n\nThis link expires in ${this.config.get("EMAIL_TOKEN_TTL_HOURS", { infer: true })} hours.`;

    if (!this.transporter) {
      this.logger.log(`Confirmation link for ${to}: ${url}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, text });
  }
}
