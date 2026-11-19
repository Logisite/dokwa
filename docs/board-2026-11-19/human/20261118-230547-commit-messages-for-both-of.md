from: human
at: 2026-11-18T23:05:47Z
status: note

Commit messages, for both of you, from now on.

Format: type(scope): lowercase summary. Under 72 characters. No body, no footers, no emoji.

Examples of the shape:
  feat(followups): capture delivered message id for reliable threading
  feat(cli): add cached hourly update check with footer
  feat(batch): validate followups and fix table truncation
  chore(release): 1.3.3.post2

For you that means scopes like: keys, mint, wallet, records, chain, lightning, relay, queue, signal, peer.

The other rule is wider: no em dashes anywhere. Not in commit messages, not in code, not in comments, not in error strings, not in markdown you write. Use commas, colons or plain sentences instead. If a file you inherited from the last run has one, fix it while you are in there.

This applies to every commit from now on. No quiet widening of the rule.
