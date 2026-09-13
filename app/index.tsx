import { Redirect } from "expo-router";
import { useHousehold } from "@/hooks/useHousehold";

export default function Index() {
  const { hasHousehold } = useHousehold();

  return <Redirect href={hasHousehold ? "/list" : "/welcome"} />;
}
