import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";

type RequireSessionProps = {
  children: ReactNode;
  requireHome?: boolean;
  redirectIfHome?: boolean;
};

export function RequireSession({
  children,
  requireHome = false,
  redirectIfHome = false,
}: RequireSessionProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { hasHousehold, isLoading: isHomeLoading } = useHousehold();

  if (isAuthLoading || (user && isHomeLoading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/welcome" />;
  }

  if (requireHome && !hasHousehold) {
    return <Redirect href="/create-home" />;
  }

  if (redirectIfHome && hasHousehold) {
    return <Redirect href="/items" />;
  }

  return children;
}
