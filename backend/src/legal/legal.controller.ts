import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { LEGAL_TEXT } from "./legal-text";

const APP = "One More Thing";
const CONTACT = "onemorething95@gmail.com";

function escape(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · ${APP}</title>
<style>
  body { margin: 0; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2430; background: #f6f8fb; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 20px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 40px 0 8px; }
  p { margin: 0 0 14px; color: #3a4252; }
  nav { margin: 0 0 28px; font-size: 14px; }
  nav a, a { color: #1976d2; }
  section[dir="rtl"] { border-top: 1px solid #dfe4ec; margin-top: 36px; padding-top: 8px; }
  footer { margin-top: 40px; font-size: 13px; color: #6b7385; }
</style>
</head>
<body><main>
<nav><a href="/">${APP}</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></nav>
${body}
<footer>Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></footer>
</main></body>
</html>`;
}

function section(lang: "en" | "ar", title: string, paragraphs: readonly string[]) {
  const attrs = lang === "ar" ? ' lang="ar" dir="rtl"' : "";
  const heading = lang === "ar" ? "h2" : "h1";
  return `<section${attrs}><${heading}>${escape(title)}</${heading}>${paragraphs
    .map((text) => `<p>${escape(text)}</p>`)
    .join("")}</section>`;
}

/** Public pages for the Google sign-in consent screen and app stores. */
@Controller()
@SkipThrottle()
export class LegalController {
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  home() {
    return page(
      APP,
      `<h1>${APP}</h1><p>A shared shopping list for your home: add items together, shop the list, and keep track of what you bought and what it cost.</p>
<p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></p>`,
    );
  }

  @Get("privacy")
  @Header("Content-Type", "text/html; charset=utf-8")
  privacy() {
    return page(
      LEGAL_TEXT.en.privacyTitle,
      section("en", LEGAL_TEXT.en.privacyTitle, LEGAL_TEXT.en.privacy) +
        section("ar", LEGAL_TEXT.ar.privacyTitle, LEGAL_TEXT.ar.privacy),
    );
  }

  @Get("terms")
  @Header("Content-Type", "text/html; charset=utf-8")
  terms() {
    return page(
      LEGAL_TEXT.en.termsTitle,
      section("en", LEGAL_TEXT.en.termsTitle, LEGAL_TEXT.en.terms) +
        section("ar", LEGAL_TEXT.ar.termsTitle, LEGAL_TEXT.ar.terms),
    );
  }
}
