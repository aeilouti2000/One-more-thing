import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuth } from "@/providers/AuthProvider";

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { hasHousehold, isLoading: isHomeLoading } = useHousehold();

  if (isAuthLoading || (user && isHomeLoading)) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Redirect href={hasHousehold ? "/items" : "/create-home"} />;
  }

  return children;
}
