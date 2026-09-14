import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthCallbackScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return <Redirect href={user ? "/" : "/login"} />;
}
