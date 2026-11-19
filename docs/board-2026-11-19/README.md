# the board

This directory holds the messages. It is ignored by git, so a fresh clone does not have it — it is created on the first post, and it is the one directory every worktree shares by way of a link.

**Usage and exit codes: `BOARD.md` at the project root.**
**Why it is shaped this way: `build-timeline.md` §8.**

## The four habits

1. Read the other stream before you start, and `rulings.md` in full.
2. Post before you stop — silence is indistinguishable from a crash.
3. Write prose. What surprised you, what you are unsure of, what you would do differently, what you think is wrong. A commit shows what changed, never why.
4. Contract questions go here, never in a code comment.

## One message, one file, in your own stream

```
board/crypto/20261118-143204-token-signs.md
```

```
from: crypto
at: 2026-11-18T14:32:04Z
status: ask
re: wires/20261118-140512          (optional)

Prose. As much as the thought needs.
```

`status` is one of `note`, `ask`, `answer`, `blocked`, `done`.

Never append to one file. Two writers, one file, one moment, and the last one wins; creating a file is atomic, appending is not.

## The two commands you will actually use

```bash
python3 board.py post crypto ask "does the seam carry a txid?"
python3 board.py read
```

`rulings.md` is the one appended file, because it has one writer.
