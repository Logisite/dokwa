// The dokwa theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in dokwa.settings.json and the generated dokwa.settings.ts;
// change them with `astryx experimental theme editor set dokwa ...`. Add your own changes below: they win over the settings.
import { defineTheme } from "@astryxdesign/core/theme";
import { dokwaSettings } from "./dokwa.settings";

export const dokwaTheme = defineTheme({
  extends: dokwaSettings,
  name: "dokwa",
});
