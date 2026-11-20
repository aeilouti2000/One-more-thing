// The app's entry point. The widgets' background task has to be registered
// before anything else, so it exists when Android starts the app's code
// without showing the app (see features/widgets/headless-task.ts).
import "./features/widgets/headless-task";
import "expo-router/entry";
