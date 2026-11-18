#!/usr/bin/env python3
"""Random idea amalgamation generator.

Reads lines from the agent-generated idea files and a field from the world file,
then blindly mashes them into a template. No idea content is authored here.

    python idea_generator.py 5
    python idea_generator.py 5 --all
    python idea_generator.py 5 --parts 4 --template "A tool that does {parts} via {field}."
    python idea_generator.py 5 --seed 42

Placeholders: {parts} = mashed source lines, {field} = a field from the world file.
"""

import argparse
import glob
import os
import random
import re

HERE = os.path.dirname(os.path.abspath(__file__))

DEFAULT_TEMPLATE = "A software that does {parts} in a {field}."


def read_lines(path):
    """Return stripped content lines (bullets and headings included)."""
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            text = line.strip()
            if not text:
                continue
            text = re.sub(r"^[-*]\s+", "", text)
            text = re.sub(r"^#{1,6}\s+", "", text)
            text = re.sub(r"^\d+\.\s+", "", text)
            if text:
                out.append(text)
    return out


def read_fields(path):
    """Return field names from '## N. Name' headings."""
    fields = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("## "):
                name = line[3:].strip()
                name = re.sub(r"^\d+\.\s*", "", name)
                if name and name.lower() != "contents":
                    fields.append(name)
    return fields


def lower_first(s):
    return s[:1].lower() + s[1:] if s else s


def strip_period(s):
    return s[:-1].rstrip() if s.endswith(".") else s


def load_corpus(include_all, include_useful):
    patterns = ["remix-*.md"]
    if include_all:
        patterns.append("ideas-*.md")
    if include_useful:
        patterns.append("useful-ideas-*.md")

    pools = {}
    for pattern in patterns:
        for path in sorted(glob.glob(os.path.join(HERE, pattern))):
            lines = read_lines(path)
            if lines:
                pools[os.path.basename(path)] = lines

    field_path = os.path.join(HERE, "fields-of-the-world.md")
    fields = read_fields(field_path) if os.path.exists(field_path) else []
    return pools, fields


def pick_fragments(pools, count):
    """Rotate across files so picks come from different sources."""
    names = list(pools)
    random.shuffle(names)
    picked = []
    while len(picked) < count:
        for name in names:
            if len(picked) >= count:
                break
            picked.append(random.choice(pools[name]))
    return picked


def make_idea(pools, fields, parts, template):
    fragments = pick_fragments(pools, parts)
    mashed = ", ".join(strip_period(lower_first(f)) for f in fragments)
    field = random.choice(fields) if fields else "unknown field"
    return template.replace("{parts}", mashed).replace("{field}", field)


def main():
    global HERE
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("count", type=int, help="how many ideas to churn out")
    ap.add_argument("--all", action="store_true", help="also use the 100-idea source files")
    ap.add_argument("--useful", action="store_true", help="use the useful-sounding rewritten 100-idea files")
    ap.add_argument("--parts", type=int, default=3, help="source lines per idea (default: 3)")
    ap.add_argument("--template", default=DEFAULT_TEMPLATE, help="output template")
    ap.add_argument("--seed", type=int, help="random seed")
    ap.add_argument("--dir", default=HERE, help="directory containing the files")
    args = ap.parse_args()

    HERE = args.dir
    if args.seed is not None:
        random.seed(args.seed)

    pools, fields = load_corpus(args.all, args.useful)
    if not pools:
        raise SystemExit("no idea files found")
    print(f"[sources] files: {len(pools)} | lines: {sum(len(v) for v in pools.values())} | fields: {len(fields)}\n")

    for i in range(1, args.count + 1):
        print(f"{i}. {make_idea(pools, fields, args.parts, args.template)}")


if __name__ == "__main__":
    main()
