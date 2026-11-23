// The little of React Native the offline code touches, for `node --test`.
export const AppState = {
  currentState: "active",
  addEventListener: () => ({ remove() {} }),
};
export const Platform = { OS: "android", select: (choices) => choices.android ?? choices.default };
