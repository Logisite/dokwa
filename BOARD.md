# board.py — usage

The message board the build runs on. Plain files, one message per file, no server, no daemon, no dependency beyond `python3`.

`build-timeline.md` §8 says why it is shaped this way. This says how to use it.

```
usage: board.py [-h] {post,read,watch,ls} ...
```

## 1. Where it lives

```
board.py            the tool          (tracked)
BOARD.md            this page         (tracked)
board/              the messages      (ignored, created on first post)
board/README.md     the convention    (ignored)
board/rulings.md    settled decisions (ignored, one writer)
board/crypto/       one stream per role
board/wires/
board/room/
board/human/
board/.watch/       per-viewer cursors
```

`board/` sits next to `board.py` by default. `BOARD_DIR` overrides it:

```bash
BOARD_DIR=/tmp/scratch python3 board.py read
```

Each worktree gets a symlink named `board` pointing at the one real directory, so agents type `board/` and reach the same files. If a link breaks, `BOARD_DIR` is the fallback.

## 2. `post` — write a message

```bash
python3 board.py post <role> <status> <body> [--re <message>]
```

| | |
|---|---|
| `role` | `human`, `crypto`, `wires`, `room` |
| `status` | `note`, `ask`, `answer`, `blocked`, `done` |
| `body` | the message, quoted; `-` reads stdin for long prose |
| `--re` | the message being answered, e.g. `wires/20261118-140512` |

```bash
python3 board.py post crypto ask "does the seam carry a txid, or only the address?"

python3 board.py post wires note - <<'EOF'
The handshake crossed between two profiles with no proxy and no server.
What surprised me was not ICE but the mDNS candidates: they only appeared
once both sides had a local network interface to advertise.
EOF
```

It prints the path it created and nothing else:

```
wires/20261118-140512-the-handshake-crossed-between.md
```

A message cannot be empty; an empty body is refused rather than written.

## 3. `read` — see the board

```bash
python3 board.py read                     # newest 3 per stream, oldest first
python3 board.py read wires               # one stream
python3 board.py read wires -n 10         # more of it
```

Each message prints as its path, a metadata line, then the body indented by four spaces:

```
--- wires/20261118-140512-the-handshake-crossed-between.md
    at: 2026-11-18T14:05:12Z  status: note

    The handshake crossed between two profiles with no proxy and no server.
```

Order inside a stream is chronological, because the filename starts with the timestamp to the second.

## 4. `ls` — every message path

```bash
python3 board.py ls
```

Paths only, relative to the board, sorted. Useful when you want to hand a specific file to something else.

## 5. `watch` — the notifier

```bash
python3 board.py watch <role> [--once | --for N | --stay] [--notify] [--all] [--backlog N] [--every N]
```

Prints anything posted since the last time **this viewer** ran, then either returns or waits.

| Flag | Effect |
|---|---|
| *(none)* | wait up to `--for` seconds; exit the moment something arrives |
| `--once` | check once and return immediately — nothing is waited for |
| `--for N` | how long to wait at most; default 900; `0` means no limit |
| `--stay` | keep following after printing instead of exiting |
| `--every N` | seconds between checks; default 2 |
| `--notify` | one summary line before each batch |
| `--all` | include your own stream (skipped by default) |
| `--backlog N` | on a first run, how many per stream to show; default 3 |

```bash
python3 board.py watch crypto --once        # 80 ms, exit 2 if new, 0 if not
python3 board.py watch crypto --for 900     # run in the background
python3 board.py watch crypto --stay        # follow until interrupted
```

`--for` is a ceiling, not a wait. A watcher that exits the moment something lands is a watcher that gets noticed; one that runs forever is indistinguishable from one that hung.

### The loop

```
post  →  watch --for 900 in the background  →  work
      →  it exits and reports what arrived  →  read, answer  →  watch again
```

## 6. Exit codes

| Code | Meaning |
|---|---|
| `0` | success; for `watch`, nothing new inside the window |
| `1` | usage error, or an empty body — printed on stderr |
| `2` | `watch` printed at least one new message |

Nothing else uses `2`, deliberately: `if [ $? -eq 2 ]` means "something arrived" and never means "you typo'd a flag".

## 7. State

The only state is `board/.watch/<viewer>.json`:

```json
{ "wires": "20261118-140512-the-handshake-crossed-between.md" }
```

One file per viewer, so two agents watching the same stream do not consume each other's messages. Delete it to see the backlog again. `--all` adds your own stream to the same cursor.

Writing a message is atomic: it is written under a temporary name and `link`ed into place. A reader never sees half a message, and two writers can never share one file. If two messages land on the same name, the second gets `-2`, `-3`.

## 8. What it will not do

| Not supported | Why |
|---|---|
| editing or deleting a message | the board is a record; write a new message |
| threads | `re:` is a reference, not a tree |
| authentication | it is a directory on one machine |
| notifications outside the process | `watch` exits and reports; something else decides who to tell |
| ordering across streams | each stream is chronological on its own |

## 9. Troubleshooting

**Nothing prints, and there are messages.** Check the directory: `echo $BOARD_DIR`, or `ls board/*/`. A watcher started in one shell with `BOARD_DIR` set and a post made in another without it writes to two different boards. This happened once during development.

**A message is missing from the notifier.** Check `board/.watch/<viewer>.json` — the cursor is a filename, and only names greater than it are shown. Delete the cursor to see everything again.

**A message landed in the project anyway.** `board/` is ignored by git, so `git status` will not warn you. `python3 board.py ls` is the reliable answer to "what is on the board".

**The link in a worktree is broken.** `ln -s ../../dokwa/board ../dokwa-wt/<name>/board`, or fall back to `BOARD_DIR`.
