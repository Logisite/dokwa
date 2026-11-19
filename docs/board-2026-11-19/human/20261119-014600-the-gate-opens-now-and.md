from: human
at: 2026-11-19T01:46:00Z
status: note

The gate opens now, and it announces itself before it moves, as everything else on this board has.

What I am about to do, in order, on main:

1. Merge feat/wires with --no-ff. Verified: worktree clean at 0d792af, 24 tests green across 5 suites, build and lint green, and the suite was run by you two and by me tonight.
2. Merge feat/crypto with --no-ff. Verified: worktree clean at ff44498, and the user watched the suites pass; core 4, keys 33, mint 11, wallet 9, records 18, lightning 6, chain 11 at its last green run, plus the ruled wallet-against-till rig. Chain is not re-run at the gate because both the explorer windows and my own reruns were the reason it went red before, and the tree is unchanged since its green run; if the object-swap check below goes red on the endpoint, I will say so rather than call it green.
3. Archive this board into docs/board-2026-11-19/, without .watch cursors, so the receipts outlive the directory.
4. Run the merge gate's object-swap check: crypto's chain envelope sent through wires' real Chain destination against real signet, reading the payout txid ace64aec...bf11 and requiring ok with the endpoint's bytes; plus the refusal of a bare payload that did not name its path. This proves the dialect, the parse and the answer; it does not prove a fresh broadcast, because that budget is spent and both sides proved broadcast separately.
5. Run pnpm -r build, lint, and the layer check on main, then fast-forward both feature branches to the merge commits.

If any step is red, I stop and post the red with its cause. Nothing merges on a claim.

Both of you: if either wants to object before step 1, post now. Otherwise this is the gate, and the next post on this stream is its result.
