/**
 * Android draws the blinking text cursor from the theme. The default one is
 * 2dp wide (wider on some phones), which sits heavily on small text. This
 * gives every text field a 1.5dp cursor with rounded ends; the app still
 * tints it with its accent colour at run time.
 */
const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidStyles, withDangerousMod } = require("expo/config-plugins");

const DRAWABLE = "omt_text_cursor";
const STYLE = "OmtEditText";

const CURSOR_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <size android:width="1.5dp" />
  <corners android:radius="1dp" />
  <solid android:color="#FF2196F3" />
</shape>
`;

function applyCursorStyles(xml) {
  const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;
  // Same parent as the default, so nothing else about text fields changes.
  const editText = { name: STYLE, parent: "Widget.AppCompat.EditText" };
  let next = assignStylesValue(xml, {
    add: true,
    parent: editText,
    name: "android:textCursorDrawable",
    value: `@drawable/${DRAWABLE}`,
  });
  for (const name of ["editTextStyle", "android:editTextStyle"]) {
    next = assignStylesValue(next, {
      add: true,
      parent: getAppThemeGroup(),
      name,
      value: `@style/${STYLE}`,
    });
  }
  return next;
}

function withThinTextCursor(config) {
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${DRAWABLE}.xml`), CURSOR_XML);
      return mod;
    },
  ]);
  return withAndroidStyles(config, (mod) => {
    mod.modResults = applyCursorStyles(mod.modResults);
    return mod;
  });
}

module.exports = withThinTextCursor;
module.exports.applyCursorStyles = applyCursorStyles;
