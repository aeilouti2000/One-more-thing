import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../../config/env";
import { DomainError } from "../../../common/domain.error";

export type CodeEmailKind = "verify" | "reset";

const COPY: Record<CodeEmailKind, { subject: string; lead: string }> = {
  verify: {
    subject: "Your One More Thing verification code",
    lead: "Use this code to confirm your email address:",
  },
  reset: {
    subject: "Reset your One More Thing password",
    lead: "Use this code to set a new password:",
  },
};

/**
 * Sends transactional email through Brevo's HTTPS API (Render's free plan
 * blocks SMTP ports). With no API key (local dev), the code is logged instead.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async sendCode(to: string, code: string, kind: CodeEmailKind, minutes: number) {
    const apiKey = this.config.get("BREVO_API_KEY", { infer: true });
    const fromEmail = this.config.get("MAIL_FROM_EMAIL", { infer: true });
    const fromName = this.config.get("MAIL_FROM_NAME", { infer: true }) || "One More Thing";
    const copy = COPY[kind];

    if (!apiKey || !fromEmail) {
      if (this.config.get("NODE_ENV", { infer: true }) === "production") {
        this.logger.error("Email is not configured (BREVO_API_KEY / MAIL_FROM_EMAIL)");
        throw new DomainError("EMAIL_UNAVAILABLE", "Email is not available right now", HttpStatus.SERVICE_UNAVAILABLE);
      }
      this.logger.warn(`[dev] ${kind} code for ${to}: ${code}`);
      return;
    }

    const text = `${copy.lead}\n\n${code}\n\nThe code expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`;
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#12141A">
  <p style="font-size:15px;margin:0 0 16px">${copy.lead}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${code}</p>
  <p style="font-size:13px;color:#6B7280;margin:0">The code expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject: copy.subject,
        textContent: text,
        htmlContent: html,
      }),
    }).catch((error: unknown) => {
      this.logger.error(`Brevo request failed: ${String(error)}`);
      return null;
    });

    if (!response || !response.ok) {
      if (response) this.logger.error(`Brevo responded ${response.status}: ${await response.text().catch(() => "")}`);
      throw new DomainError("EMAIL_SEND_FAILED", "Couldn't send the email. Try again.", HttpStatus.BAD_GATEWAY);
    }
  }
}
