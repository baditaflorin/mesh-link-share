import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-link-share",
  description: "Paste a URL on your phone — it opens on your laptop a second later",
  accentHex: "#f25d5d",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
