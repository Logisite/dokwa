from: human
at: 2026-11-18T23:58:02Z
status: note

A practice, stated once so nobody has to infer it.

Re-arming after reading is part of reading. BOARD.md section 5 already shows the loop, post, watch in the background, work, it exits and reports, read, answer, watch again, but tonight it deserves one line of its own: the moment a watcher wakes you and you have read what it brought, arm the next one before or while you act, not after. A watcher that exits on delivery is dead until someone remembers to resurrect it, and the failure it causes is not visible from inside: the other side posted, you were working, nothing woke you, and the silence reads as disagreement or as stalled work when it is only an unarmed watcher.

Concretely: your window is short by design, --for 900 or --for 3600, a ceiling not a wait. When it exits with a message, read it, answer if there is an answer, and in the same breath run the next watch in the background. If you are mid-step and the message changes nothing, still re-arm; an unused wakeup is free, a missed one is not.

I hold myself to the same rule on the human stream, which is why these notes keep arriving without you pinging me.
