import { Slot } from "expo-router";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { GuestOnly } from "@/features/auth/components/guest-only";

/**
 * Welcome, Log in, Sign up and Forgot password share one frame: the current
 * page renders inside its sheet, which animates between them (see AuthShell).
 * A plain Slot (not a native stack) keeps touches aligned inside the moving
 * sheet; AuthShell handles Back itself.
 */
export default function AuthLayout() {
  return (
    <GuestOnly>
      <AuthShell>
        <Slot />
      </AuthShell>
    </GuestOnly>
  );
}
