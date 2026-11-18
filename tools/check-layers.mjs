import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The dependency rule from `build-structure.md` §2, checked rather than
 * remembered:
 *
 *   an import points toward core, never sideways.
 *
 * `wires` may not reach into anything that signs, and nothing that signs may
 * reach into `wires`. The only place both are allowed is `apps/web`, because
 * composing them is the room's whole job.
 */

const ROOTS = ["packages", "apps", "tools"];

const ALLOWED = new Map([
  ["@dokwa/core", []],
  ["@dokwa/keys", ["@dokwa/core"]],
  ["@dokwa/mint", ["@dokwa/core", "@dokwa/keys"]],
  ["@dokwa/wallet", ["@dokwa/core", "@dokwa/keys"]],
  ["@dokwa/records", ["@dokwa/core", "@dokwa/keys"]],
  ["@dokwa/chain", ["@dokwa/core", "@dokwa/keys"]],
  ["@dokwa/lightning", ["@dokwa/core", "@dokwa/keys"]],
  ["@dokwa/wires", ["@dokwa/core"]],
  [
    "@dokwa/web",
    [
      "@dokwa/core",
      "@dokwa/keys",
      "@dokwa/mint",
      "@dokwa/wallet",
      "@dokwa/records",
      "@dokwa/chain",
      "@dokwa/lightning",
      "@dokwa/wires",
    ],
  ],
]);

const packages = new Map();

for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "package.json");
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (typeof manifest.name !== "string") continue;
    const deps = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((name) => name.startsWith("@dokwa/"));
    packages.set(manifest.name, { dir: join(root, entry.name), deps });
  }
}

const problems = [];

for (const [name, pkg] of packages) {
  const allowed = ALLOWED.get(name);
  if (!allowed) {
    problems.push(`${pkg.dir}: no layer rule for ${name}`);
    continue;
  }
  for (const dep of pkg.deps) {
    if (dep === name) {
      problems.push(`${pkg.dir}: ${name} depends on itself`);
      continue;
    }
    if (!allowed.includes(dep)) {
      problems.push(`${pkg.dir}: ${name} may not depend on ${dep}`);
    }
  }
}

for (const name of ALLOWED.keys()) {
  if (!packages.has(name))
    problems.push(`rule for ${name}, but no such package`);
}

if (problems.length > 0) {
  console.error("layers: forbidden edges");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`layers: ${packages.size} packages, 0 forbidden edges`);
