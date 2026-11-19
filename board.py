#!/usr/bin/env python3
"""board - a message board made of plain files.

One message is one file, in your own stream:

    board/crypto/20261118-143204-token-signs.md

Why not one appended file: two writers, one file, one moment, and the
last one wins. Creating a file is atomic; appending is not.

    board.py post crypto ask "does the seam need a txid?"
    board.py post wires note -            # body from stdin
    board.py post room note "done" --re wires/20261118-1405
    board.py read                         # newest 3 from every stream
    board.py read wires -n 10
    board.py ls

    board.py watch crypto --for 900       # run in background; exits when
                                          # something new arrives, or on timeout

    board.py watch crypto --stay          # follow until interrupted
    board.py watch crypto --all --notify  # include your own stream, one summary line

`watch` is the notifier. Start it in the background; it prints anything
posted since the last time it ran, then waits. Exit code 2 means it
printed something, 0 means it timed out with nothing new.

The files are the board. This script is a convenience: anything that can
read a file can read the board, and nothing breaks if this is deleted.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROLES = ("human", "crypto", "wires", "room")
STATUSES = ("note", "ask", "answer", "blocked", "done")
SKIP = {"README.md", "rulings.md"}


def board_dir() -> Path:
    env = os.environ.get("BOARD_DIR")
    if env:
        return Path(env).expanduser()
    return Path(__file__).resolve().with_name("board")


def slug(text: str, limit: int = 32, words: int = 5) -> str:
    out = ""
    for w in re.findall(r"[a-z0-9]+", text.lower())[:words]:
        candidate = f"{out}-{w}" if out else w
        if len(candidate) > limit:
            break
        out = candidate
    return out or "message"


def post(role: str, status: str, body: str, reply_to: str | None, to: list[str]) -> Path:
    now = datetime.now(timezone.utc)
    root = board_dir()
    stream = root / role
    stream.mkdir(parents=True, exist_ok=True)

    stem = f"{now:%Y%m%d-%H%M%S}-{slug(body)}"
    header = [f"from: {role}", f"at: {now:%Y-%m-%dT%H:%M:%SZ}", f"status: {status}"]
    header.append(f"to: {', '.join(to) if to else 'all'}")
    if reply_to:
        header.append(f"re: {reply_to}")
    text = "\n".join(header) + "\n\n" + body.strip() + "\n"

    # Write to a temp name, then link into place. A link either exists or
    # fails, so a reader never sees half a message and two writers never
    # share one file.
    tmp = stream / f".tmp-{os.getpid()}-{time.time_ns()}"
    tmp.write_text(text, encoding="utf-8")
    try:
        for n in range(1, 100):
            name = f"{stem}.md" if n == 1 else f"{stem}-{n}.md"
            path = stream / name
            try:
                os.link(tmp, path)
                return path
            except FileExistsError:
                continue
        raise SystemExit(f"board: could not create a file under {stream}")
    finally:
        tmp.unlink(missing_ok=True)


def parse(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    head: dict[str, str] = {}
    body = text
    if text.startswith("from:"):
        block, sep, rest = text.partition("\n\n")
        if sep:
            for line in block.splitlines():
                key, colon, value = line.partition(":")
                if colon:
                    head[key.strip()] = value.strip()
            body = rest
    return {"path": path, "head": head, "body": body.strip()}


def format_message(path: Path) -> str:
    msg = parse(path)
    head = msg["head"]
    meta = "  ".join(f"{k}: {head[k]}" for k in ("at", "status", "to", "re") if k in head)
    lines = [f"--- {path.parent.name}/{path.name}"]
    if meta:
        lines.append(f"    {meta}")
    lines.append("")
    lines.extend(f"    {line}" for line in msg["body"].splitlines())
    return "\n".join(lines)


def messages(role: str | None = None) -> list[Path]:
    root = board_dir()
    if not root.is_dir():
        return []
    roles = [role] if role else [r for p in root.iterdir() if p.is_dir()
                                 for r in [p.name] if not r.startswith(".")]
    found: list[Path] = []
    for r in roles:
        found.extend(p for p in (root / r).glob("*.md") if p.name not in SKIP)
    return sorted(found, key=lambda p: (p.parent.name, p.name))


def read(role: str | None, count: int) -> int:
    found = messages(role)
    if not found:
        print("board: nothing yet" if not board_dir().is_dir() else "board: no messages")
        return 0
    for r in sorted({p.parent.name for p in found}):
        for path in [p for p in found if p.parent.name == r][-count:]:
            print(format_message(path))
            print()
    return 0


# --- the notifier ------------------------------------------------------

def cursor_path(viewer: str) -> Path:
    return board_dir() / ".watch" / f"{viewer}.json"


def load_cursor(viewer: str) -> dict | None:
    path = cursor_path(viewer)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return None


def save_cursor(viewer: str, cursor: dict) -> None:
    path = cursor_path(viewer)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(cursor, indent=0, sort_keys=True), encoding="utf-8")
    os.replace(tmp, path)


def recipients(msg: dict) -> list[str]:
    """Empty means broadcast: everyone but the author."""
    raw = msg["head"].get("to", "all").strip()
    if not raw or raw in ("all", "*"):
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def addressed_to(msg: dict, viewer: str) -> bool:
    return viewer in recipients(msg) or not recipients(msg)


def scan(viewer: str, cursor: dict, include_all: bool, backlog: int,
         see_all: bool = False) -> tuple[list[Path], dict]:
    """Return what this viewer has not seen, and the cursor to remember."""
    root = board_dir()
    found: list[Path] = []
    next_cursor = dict(cursor)
    if not root.is_dir():
        return found, next_cursor

    for stream in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        role = stream.name
        if role == viewer and not include_all:
            continue
        files = sorted(p for p in stream.glob("*.md") if p.name not in SKIP)
        if not files:
            continue
        mark = cursor.get(role)
        unseen = files[-backlog:] if mark is None else [p for p in files if p.name > mark]
        if not see_all:
            unseen = [p for p in unseen if addressed_to(parse(p), viewer)]
        found.extend(unseen)
        next_cursor[role] = files[-1].name

    return found, next_cursor


def watch(viewer: str, seconds: int, every: int, stay: bool, once: bool,
          include_all: bool, notify: bool, backlog: int) -> int:
    def stop(*_: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)

    cursor = load_cursor(viewer)

    if once:
        new, next_cursor = scan(viewer, cursor or {}, include_all, backlog, see_all=include_all)
        for path in new:
            print(format_message(path))
            print()
        if next_cursor != (cursor or {}):
            save_cursor(viewer, next_cursor)
        return 2 if new else 0

    if cursor is None:
        cursor = {}
        first = "first run, showing the last few from each stream"
    else:
        first = "showing what arrived since last time"

    limit = f"{seconds}s" if seconds > 0 else "no limit"
    print(f"[board] watching as {viewer} for {limit}; {first}")
    print("[board] exit 2 = something new, exit 0 = timed out with nothing")
    sys.stdout.flush()

    deadline = time.time() + seconds if seconds > 0 else None

    try:
        while True:
            new, next_cursor = scan(viewer, cursor, include_all, backlog, see_all=include_all)
            if new:
                if notify:
                    print(f"[board] {len(new)} new message{'s' if len(new) > 1 else ''}")
                for path in new:
                    print(format_message(path))
                    print()
                sys.stdout.flush()
            if next_cursor != cursor:
                save_cursor(viewer, next_cursor)
                cursor = next_cursor
            if new and not stay:
                return 2
            if deadline is not None and time.time() >= deadline:
                return 0
            time.sleep(every)
    except KeyboardInterrupt:
        print("[board] stopped")
        return 0


class Parser(argparse.ArgumentParser):
    """Usage errors exit 1, so exit 2 always means 'watch found something'."""

    def error(self, message: str) -> None:
        self.print_usage(sys.stderr)
        raise SystemExit(f"board: {message}")


def main() -> int:
    parser = Parser(prog="board.py", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_post = sub.add_parser("post", help="write a message to your stream")
    p_post.add_argument("role", choices=ROLES)
    p_post.add_argument("status", choices=STATUSES)
    p_post.add_argument("body", help='the message, or "-" to read stdin')
    p_post.add_argument("--re", dest="reply_to", default=None, help="e.g. wires/20261118-1405")
    p_post.add_argument("--to", default="all",
                        help="recipients, comma-separated; all means everyone but you (default all)")

    p_read = sub.add_parser("read", help="print the newest messages, oldest first")
    p_read.add_argument("role", nargs="?", choices=ROLES, default=None)
    p_read.add_argument("-n", "--count", type=int, default=3, help="per stream (default 3)")

    p_watch = sub.add_parser("watch", help="background notifier: print new messages, then exit or wait")
    p_watch.add_argument("role", choices=ROLES, help="who you are; your own stream is skipped")
    p_watch.add_argument("--for", dest="seconds", type=int, default=900,
                         help="seconds to wait before giving up; 0 means forever (default 900)")
    p_watch.add_argument("--every", type=int, default=2, help="seconds between checks (default 2)")
    p_watch.add_argument("--stay", action="store_true", help="keep following after printing, do not exit")
    p_watch.add_argument("--once", action="store_true",
                         help="check once and return immediately; nothing is waited for")
    p_watch.add_argument("--all", dest="include_all", action="store_true",
                         help="ignore addressing and include your own stream: the full feed")
    p_watch.add_argument("--notify", action="store_true", help="print one summary line before the bodies")
    p_watch.add_argument("--backlog", type=int, default=3,
                         help="on a first run, how many per stream to show (default 3)")

    sub.add_parser("ls", help="list every message path")

    args = parser.parse_args()

    if args.cmd == "post":
        body = sys.stdin.read() if args.body == "-" else args.body
        if not body.strip():
            raise SystemExit("board: empty message, nothing written")
        to = [part.strip() for part in args.to.split(",") if part.strip()]
        if len(to) == 1 and to[0] in ("all", "*"):
            to = []
        path = post(args.role, args.status, body, args.reply_to, to)
        print(path.relative_to(board_dir()))
        return 0

    if args.cmd == "read":
        return read(args.role, max(1, args.count))

    if args.cmd == "watch":
        return watch(args.role, args.seconds, max(1, args.every), args.stay, args.once,
                     args.include_all, args.notify, max(1, args.backlog))

    for path in messages():
        print(path.relative_to(board_dir()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
