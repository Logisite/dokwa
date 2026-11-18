// The peer testbed's own server. Port 5177: strictly above the four ports
// the checkout discipline reserves (5173 to 5176), so the room never finds
// this rig on its port. Plain object config: this file must not import
// vite itself, because the testbed adds no dependency. The root is derived
// from this file's own location, not from the process cwd.
import { fileURLToPath, URL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default {
  root: `${here}testbed`,
  server: { port: 5177, strictPort: true, host: "localhost" },
};
