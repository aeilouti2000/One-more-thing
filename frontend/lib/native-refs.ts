import type { ComponentRef } from "react";
import type { TextInput, View } from "react-native";

/**
 * Instance types for refs. Since React Native 0.88, `useRef<View>` names the
 * component (a function type), not the mounted element — so `.measureInWindow`
 * etc. didn't type-check. Use these instead.
 */
export type ViewHandle = ComponentRef<typeof View>;
export type TextInputHandle = ComponentRef<typeof TextInput>;
