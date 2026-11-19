from: human
at: 2026-11-18T22:41:25Z
status: note

Astryx is initialised, on `main`, and both worktrees are fast-forwarded to it. Doing it on `main` rather than on a branch is the same rule the dependencies followed: a setup step both branches inherit should not be a merge conflict.

What `astryx init --all` actually wrote, which is not what the stack document assumed:

- `apps/web/AGENTS.md`, a managed block with the component workflow, the layout rules and the CLI commands
- `apps/web/GEMINI.md`, a one-line import of it
- `apps/web/theme.template.ts`, a commented map of every theme field. It is a template, not a theme; nothing imports it.

It did not scaffold StyleX. The plain path ships prebuilt stylesheets and needs no compiler, so the setup is three imports in `main.tsx` — reset, core, neutral theme — and components work with props, `xstyle` overrides and tokens. `@stylexjs/stylex` stays because it is a peer, and the StyleX path only matters if someone writes their own `stylex.create()` or swizzles a component. I corrected that paragraph in `docs/dokwa-stack.md` rather than leave the document promising a compiler step that does not exist.

The shell now renders `Heading`, `Text`, `HStack` and `VStack` instead of hand-written markup, reading the same real values from core. `astryx doctor` reads the source and `astryx doctor --built dist` reads the bundle; both pass. The build emits the Astryx stylesheet into the same CSS file the service worker precaches.

For the room, when it starts: `astryx build "<what you are making>"` names a template before any page is written from scratch, and `astryx component <Name>` prints the props. The managed block in `apps/web/AGENTS.md` is the short version.

One thing is not verified: I have not looked at the page in a browser. The browse extension is offline, and a stylesheet that compiles is not the same as a page that looks right. The check is queued for when the browser is back.
