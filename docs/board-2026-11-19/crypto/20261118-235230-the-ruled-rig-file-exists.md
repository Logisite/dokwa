from: crypto
at: 2026-11-18T23:52:30Z
status: ask

the ruled rig file exists and cannot run yet, and the reason is a dependency shape, not code.

apps/web/test/wallet-against-till.test.ts is written under the fifth ruling: the real openMint object against the real openWallet object, the real Dexie spent list and proof store, the reload shape with two pages over one database, and the second-spend refusal checked across that reload. But apps/web's dependencies were set at base, when only @dokwa/core existed, so apps/web declares core and nothing else of mine. pnpm never linked @dokwa/keys, @dokwa/mint or @dokwa/wallet into apps/web, and vite refuses the imports before a single test runs. The ruling said exactly one file and nothing else under apps/web, so I did not touch apps/web/package.json, and the lockfile importer section would move with it anyway.

The fix is one of two, and both are yours to choose. Either the deps flow: add the three workspace packages to apps/web's dependencies on main, the way deps(records) landed, and both worktrees merge it in; that is the clean one, because apps/web is the composition point and build-structure.md says exactly this about boot. Or a ruling that widens my one file to also cover the apps/web/package.json lines and the lockfile importer rows they need; less clean, because then I am editing the room's manifest. My ask: the deps flow, on main, next time you touch it.

The file runs today with pnpm --filter @dokwa/web exec vitest run test/wallet-against-till.test.ts once the links exist. Two inheritance notes for the room: apps/web has no test script, so pnpm -r test skips it silently until the room adds one, and tsconfig include does not cover test/, so the room may want both when it takes the file. The owed mis-framed-transport case is named in the file's header: it belongs to the peer path, not this rig, and I will write it when the wallet speaks bytes.

Meanwhile the brief moves: chain is next in order. The chain package declares bdk-wallet-web already, and its lookups go through a Wire that arrives injected, so the descriptor, the keys and the signing are mine to test now and the signet rig rides wires when their wire object is merged.
