import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  interpretReceiptPhoto,
  pickReceiptPhoto,
  type ReceiptScan,
} from "@/features/items/utils/scan-receipt";
import { useI18n } from "@/providers/LanguageProvider";

type ScanItem = { id: string; name: string };

/**
 * Receipt scan flow (camera / photo library → on-device read → match lines to
 * items). Same steps and timing as the trip screen: the open sheet is hidden
 * (`covered`) so the native picker can present, then the source chooser.
 */
export function useReceiptScanner(options: {
  getItems: () => ScanItem[];
  onScanned?: (scan: ReceiptScan) => void;
}) {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<"picking" | "reading" | null>(null);
  const [cover, setCover] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const scanning = phase !== null;

  function choose() {
    if (scanning || cover) return;
    setError(null);
    setCover(true);
    timer.current = setTimeout(() => setSourceOpen(true), 320);
  }

  function closeSource() {
    setSourceOpen(false);
    setCover(false);
  }

  function start(source: "camera" | "library") {
    setSourceOpen(false);
    setPhase("picking");
    timer.current = setTimeout(() => {
      void run(source);
    }, 450);
  }

  async function run(source: "camera" | "library") {
    setError(null);
    setPhase("picking");
    try {
      const picked = await pickReceiptPhoto(source);
      if (!picked.ok) {
        setPhase(null);
        setCover(false);
        if (picked.error) setError(t(picked.error));
        return;
      }
      setPhase("reading");
      const outcome = await interpretReceiptPhoto({
        uri: picked.uri,
        preferArabic: locale === "ar",
        items: latest.current.getItems(),
      });
      setPhase(null);
      setCover(false);
      if (!outcome.ok) {
        setError(t(outcome.error));
        return;
      }
      setScan(outcome.scan);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      latest.current.onScanned?.(outcome.scan);
    } catch {
      setPhase(null);
      setCover(false);
      setError(t("scanReceiptFailed"));
    }
  }

  function reset() {
    setScan(null);
    setError(null);
  }

  return {
    /** Picking a photo or reading it. */
    scanning,
    reading: phase === "reading",
    /** Hide open sheets while the native picker is up. */
    covered: cover || scanning,
    sourceOpen,
    scan,
    error,
    choose,
    closeSource,
    start,
    reset,
  };
}
