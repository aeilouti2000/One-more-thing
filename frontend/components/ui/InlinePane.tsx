import { createContext, useContext, type ReactNode } from "react";
import { useI18n } from "@/providers/LanguageProvider";

const InlinePaneContext = createContext(false);

/**
 * Marks content that usually lives in a sheet (a Modal) but is being shown in
 * the page itself, as the side pane on wide screens.
 */
export function InlinePane({ children }: { children: ReactNode }) {
  return <InlinePaneContext.Provider value={true}>{children}</InlinePaneContext.Provider>;
}

/**
 * Whether a row in sheet content must be reversed by hand for Arabic.
 *
 * The page's root view sets the text direction, so rows in the page already
 * mirror. A Modal is its own root and doesn't get that direction, so rows
 * inside a sheet are reversed by hand, except when the same content is shown
 * inline (see InlinePane), where reversing again would undo the mirroring.
 */
export function useReverseRows() {
  const { isRTL } = useI18n();
  const inline = useContext(InlinePaneContext);
  return isRTL && !inline;
}
