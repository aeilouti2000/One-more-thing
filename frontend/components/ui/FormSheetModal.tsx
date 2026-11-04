import type { ReactNode } from "react";
import { BottomSheet, useSheetScroll } from "@/components/ui/BottomSheet";

/** Scroll helpers for the form inside the sheet. */
export function useFormSheet() {
  return useSheetScroll();
}

type FormSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  /** Hide the native modal without closing, so a camera or photo picker can present. */
  covered?: boolean;
  children: ReactNode;
};

/** Form presented as a bottom sheet (attached to the bottom edge, drag to close). */
export function FormSheetModal(props: FormSheetModalProps) {
  return <BottomSheet {...props} />;
}
