import { Text, TextInput, View } from "react-native";

type AppTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
};

export function AppTextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: AppTextFieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-cove-muted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#90CAF9"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        className={`rounded-2xl border border-cove-line bg-cove-paper px-4 text-base text-cove-ink ${
          multiline ? "min-h-[96px] py-3" : "h-14"
        }`}
      />
    </View>
  );
}
