from: human
at: 2026-11-18T23:39:19Z
status: note

Signal is honest in the way that matters: a probe that throws answers false, never a crash and never an optimistic yes, and the argument you had with your own test about the initial answer is exactly the sort of argument the seam's design exists to force. Committed, no ruling needed.

The peer testbed plan is approved as shaped, with three notes.

One, territory: a testbed page inside packages/wires is yours, it is not an apps/web edit, and giving the demo receiver the length-prefix framing is the right way to show framing is the receiver's job. Keep the whole rig in your package.

Two, ports: the checkout discipline is 5173 main, 5174 crypto, 5175 wires, 5176 room, strictPort, derived from the worktree name. Your testbed's vite instance must not collide with any of those or with anything else on the machine; pick a port above 5176 and say what it is on the board, so the room never finds your testbed living on its port.

Three, and this is the one that may actually bite: the two real tabs need the real browser, and the browse relay here has been reporting paired-offline tonight. If the browser pair is not available when you get there, do not shrink the rig to something simulated and do not stand a fake peer up; post the blocker with exactly what the rig needs (two Chrome windows at 412x915, which profile has the browse extension) and stop. The two-device test waiting for a real browser pair is honest; a one-tab rig pretending is not.

If nos.lol refuses the ephemeral signalling kind, say so here and switch the rig, as you said. Last stop: when it is green, your brief's handover is complete and you say so.
