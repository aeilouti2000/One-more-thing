import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { BlurBackdrop } from "@/components/ui/BlurBackdrop";

type FormSheetContextValue = {
  scrollToEnd: () => void;
  scrollToStart: () => void;
};

const FormSheetContext = createContext<FormSheetContextValue | null>(null);

export function useFormSheet() {
  return useContext(FormSheetContext);
}

type FormSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  children: ReactNode;
};

export function FormSheetModal({ visible, onClose, onShow, children }: FormSheetModalProps) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  const scrollToEnd = useCallback(() => {
    const run = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(run);
    setTimeout(run, 150);
  }, []);

  const scrollToStart = useCallback(() => {
    const run = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
    requestAnimationFrame(run);
    setTimeout(run, 150);
  }, []);

  const sheet = useMemo(
    () => ({ scrollToEnd, scrollToStart }),
    [scrollToEnd, scrollToStart],
  );

  function dismissKeyboardOrClose() {
    if (Keyboard.isVisible() || keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  }

  function closeFromOutside() {
    Keyboard.dismiss();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={onShow}
      onRequestClose={dismissKeyboardOrClose}
    >
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
        <BlurBackdrop onPress={closeFromOutside} />
        <FormSheetContext.Provider value={sheet}>
          <ScrollView
            ref={scrollRef}
            style={styles.sheet}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Pressable style={styles.dismissArea} onPress={closeFromOutside}>
              <Pressable onPress={() => undefined}>{children}</Pressable>
            </Pressable>
          </ScrollView>
        </FormSheetContext.Provider>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  sheetContent: {
    flexGrow: 1,
  },
  dismissArea: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
});
