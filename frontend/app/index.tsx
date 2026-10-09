import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";

export default function Index() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { hasHousehold, isLoading: isHomeLoading } = useHousehold();

  if (isAuthLoading || (user && isHomeLoading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/welcome" />;
  }

  return <Redirect href={hasHousehold ? "/items" : "/create-home"} />;
}
