import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { HomeLoadFailed } from "@/features/homes/components/home-load-failed";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useAuth } from "@/features/auth/providers/auth-provider";

export default function Index() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { hasHousehold, loadFailed, isLoading: isHomeLoading } = useHousehold();

  if (isAuthLoading || (user && isHomeLoading)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/welcome" />;
  }

  if (!hasHousehold && loadFailed) {
    return <HomeLoadFailed />;
  }

  return <Redirect href={hasHousehold ? "/items" : "/create-home"} />;
}
