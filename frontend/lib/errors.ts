import { translate } from "@/constants/i18n";

export function logError(scope: string, error: unknown) {
  console.error(`[${scope}]`, error);
}

export function formatAppError(
  error: unknown,
  fallback = translate("errorGeneric"),
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : fallback;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  const lower = message.toLowerCase();

  if (code === "email_exists" || code === "user_already_exists" || code === "EMAIL_TAKEN") {
    return translate("errorEmailTaken");
  }
  if (code === "INVALID_CREDENTIALS") {
    return translate("errorWrongEmailOrPassword");
  }
  if (code === "ALREADY_IN_HOME") {
    return translate("errorAlreadyHasHome");
  }
  if (code === "UNKNOWN_INVITE_CODE") {
    return translate("errorUnknownInvite");
  }
  if (code === "CURRENT_PASSWORD_WRONG") {
    return translate("errorCurrentPasswordWrong");
  }
  if (code === "PASSWORD_UNCHANGED") {
    return translate("errorNewPasswordDifferent");
  }
  if (code === "NOT_SIGNED_IN" || code === "NO_HOME") {
    return translate(code === "NO_HOME" ? "errorNeedHome" : "errorNeedLogin");
  }
  if (code === "FAMILY_NAME_REQUIRED") {
    return translate("errorEnterFamilyName");
  }
  if (code === "UNDO_EXPIRED") {
    return translate("errorUndoExpired");
  }
  if (code === "STAPLE_LIMIT") {
    return translate("errorStapleLimit");
  }
  if (code === "over_email_send_rate_limit" || lower.includes("rate limit") || lower.includes("for security purposes")) {
    return translate("errorTryAgainSoon");
  }
  if (code === "weak_password") {
    return translate("errorPasswordTooShort");
  }
  if (lower.includes("invalid login")) {
    return translate("errorWrongEmailOrPassword");
  }
  if (
    lower.includes("same password") ||
    lower.includes("should be different") ||
    lower.includes("different from the old password")
  ) {
    return translate("errorNewPasswordDifferent");
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return translate("errorPasswordTooShort");
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return translate("errorEmailTaken");
  }
  if (lower.includes("already belong to a home")) {
    return translate("errorAlreadyHasHome");
  }
  if (lower.includes("unknown invite code")) {
    return translate("errorUnknownInvite");
  }
  if (lower.includes("not signed in")) {
    return translate("errorNeedLogin");
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return translate("errorNetwork");
  }
  if (
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    lower.includes("could not find the table") ||
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("violates row-level security")
  ) {
    return translate("errorRepairSql");
  }
  if (
    (lower.includes("duplicate key") && lower.includes("home_members")) ||
    lower.includes("home_members_one_home_per_user")
  ) {
    return translate("errorAlreadyHasHome");
  }

  return message || fallback;
}
