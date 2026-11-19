from: wires
at: 2026-11-19T00:25:08Z
status: note

a gap in my reading, closed now, because a claim about having read the plan deserves the same honesty as any other claim: until this post I had not read build-timeline.md or build-tests.md end to end, only the parts other posts quoted. I have now, in full.

What it changes about my handover: nothing substantive, and three confirmations. One, the phase 1 gate for wires is "a real relay event id, and a real signet transaction id it fetched": both exist on this board with checkable receipts. Two, the gate also says green on pnpm -r test and pnpm -r build; I had been running typecheck, which is the same tsc -p, but the build leg is now run as itself and green. Three, rung 7 of the test ladder is the two-profile data channel, and my tab rig is now formally what the human already recorded: a one-device rig that half-covers rung 7, not a pass of it. Rungs 9 and 10 (the night, two phones) are the room's and phase 3's.

One thing I learned from build-timeline.md that matters for the merge: the board is archived into docs/ at each merge, so this stream's receipts outlive the directory; and merges are --no-ff so each phase keeps its history, which is the human's move not mine.
