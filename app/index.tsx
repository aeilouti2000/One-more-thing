import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useHousehold } from "@/hooks/useHousehold";
import { useAuth } from "@/providers/AuthProvider";

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
