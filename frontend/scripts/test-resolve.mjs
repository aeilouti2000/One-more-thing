// Lets `node --test` run the *.test.ts files: resolves the "@/" alias and
// extensionless TypeScript imports the way Metro and tsc do.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

// Native modules the tested code imports, replaced by small stand-ins.
const stubs = {
  "react-native": "scripts/test-stubs/react-native.mjs",
  "expo-sqlite/localStorage/install": "scripts/test-stubs/local-storage.mjs",
  "expo-sqlite": "scripts/test-stubs/expo-sqlite.mjs",
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) {
      return nextResolve(pathToFileURL(resolvePath(root, stubs[specifier])).href, context);
    }
    let base = null;
    if (specifier.startsWith("@/")) {
      base = resolvePath(root, specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.js`]) {
        if (existsSync(candidate)) {
          try {
            return nextResolve(pathToFileURL(candidate).href, context);
          } catch {
            // A directory, or not a module: try the next candidate.
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
