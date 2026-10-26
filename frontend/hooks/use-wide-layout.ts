import { useWindowDimensions } from "react-native";
import { WIDE_LAYOUT_MIN_WIDTH } from "@/lib/layout";

/** True on unfolded folds / tablets. Phone portrait stays false. */
export function useWideLayout(minWidth = WIDE_LAYOUT_MIN_WIDTH) {
  const { width } = useWindowDimensions();
  return width >= minWidth;
}
