#!/usr/bin/env python3
"""Regenerate history.html and the index.html timeline from data/productions.json.

JSON order is chronological. The history page renders it reversed (newest first);
the index timeline renders it as-is.

data/productions.json is the source of truth. Edit it, run this script, commit both
the JSON and the generated HTML. Never hand-edit the blocks between the
AUTO:...:START / AUTO:...:END markers — this script overwrites them.

    python3 scripts/build-history.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "productions.json")
HISTORY = os.path.join(ROOT, "history.html")
INDEX = os.path.join(ROOT, "index.html")

NAV = """    <nav class="topnav">
      <a href="index.html#about">About</a>
      <a href="about.html">Creator</a>
      <a href="casting.html">Casting</a>
      <a href="dispatches.html">Dispatches</a>
      <a href="reading.html">Reading&nbsp;List</a>
    </nav>"""


def esc(s):
    """Escape a bare string for HTML. Fields already containing entities are
    passed through by the caller instead."""
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def names_html(names):
    return ", ".join(esc(n) for n in names)


def render_production(p):
    accent = p.get("accent", "amber")
    out = []
    out.append('  <section class="prod" id="%s">' % p["id"])
    out.append('    <div class="prod-head">')
    out.append('      <p class="prod-eyebrow %s">%s</p>' % (accent, esc(p["date"])))
    # Venue and host share the headline; a venue that IS the host is not repeated.
    parts = [esc(p["venue"])] if p["venue"] else []
    if p.get("host") and p["host"] != p["venue"]:
        parts.append('<span class="prod-host">%s</span>' % esc(p["host"]))
    title = ' <span class="prod-sep">&middot;</span> '.join(parts) or esc(p["place"])
    out.append('      <h2 class="prod-title">%s</h2>' % title)
    sub = p["place"] if p["venue"] else ""
    if sub:
        out.append('      <p class="prod-place">%s</p>' % esc(sub))
    # billing already contains entities (&mdash;, &amp;) — pass through
    out.append('      <p class="prod-billing">%s</p>' % p["billing"])
    out.append("    </div>")

    if p.get("credits"):
        out.append('    <dl class="prod-credits">')
        for c in p["credits"]:
            out.append("      <dt>%s</dt><dd>%s</dd>" % (esc(c["role"]), names_html(c["names"])))
        out.append("    </dl>")

    out.append('    <div class="prod-cast">')
    out.append('      <p class="cast-label %s">%s</p>' % (accent, esc(p.get("castLabel", "Cast"))))
    if p.get("cast"):
        cols = "cast-cols" if len(p["cast"]) > 6 else "cast-cols cast-cols-2"
        out.append('      <div class="%s">' % cols)
        for n in p["cast"]:
            out.append('        <span class="cast-name">%s</span>' % esc(n))
        out.append("      </div>")
    elif p.get("castNote"):
        out.append('      <p class="cast-note">%s</p>' % esc(p["castNote"]))
    out.append("    </div>")

    if p.get("additional"):
        out.append('    <dl class="prod-credits prod-extra">')
        for c in p["additional"]:
            out.append("      <dt>%s</dt><dd>%s</dd>" % (esc(c["role"]), names_html(c["names"])))
        out.append("    </dl>")

    if p.get("cta"):
        out.append('    <p class="prod-cta"><a href="%s">%s</a></p>'
                   % (p["cta"]["href"], p["cta"]["label"]))

    out.append("  </section>")
    return "\n".join(out)


def render_timeline(prods):
    """The five .node divs inside index.html's .tl .nodes container."""
    out = []
    for p in prods:
        bits = ['<div class="node">', '<div class="dot"></div>',
                '<div class="yr">%s</div>' % esc(p["year"])]
        place = p["venue"] or p["place"]
        if p["id"] == "deerfield-2019":
            place = "School meeting"
        elif p["id"] == "nyc-2023":
            place = "NY Times Center, NYC"
        elif p["id"] == "san-diego-2024":
            place = "San Diego"
        elif p["id"] == "sxsw-2026":
            place = "SXSW EDU, Austin"
        elif p["id"] == "pittsburgh-2026":
            place = "Pittsburgh"
        bits.append('<div class="pl">%s</div>' % esc(place))
        # The rail stays terse: use timelineBilling when the page copy runs long.
        bits.append('<div class="ds">%s</div>' % (p.get("timelineBilling") or p["billing"]))
        if p.get("cta"):
            bits.append('<a class="cta" href="%s">%s</a>' % (p["cta"]["href"], p["cta"]["label"]))
        bits.append("</div>")
        out.append("        " + "".join(bits))
    return "\n".join(out)


def replace_block(text, marker, body, path):
    start = "<!-- AUTO:%s:START -->" % marker
    end = "<!-- AUTO:%s:END -->" % marker
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if not pattern.search(text):
        sys.exit("error: %s is missing the AUTO:%s markers" % (path, marker))
    return pattern.sub(lambda _: "%s\n%s\n%s" % (start, body, end), text, count=1)


def main():
    with open(DATA, encoding="utf-8") as fh:
        prods = json.load(fh)["productions"]

    with open(HISTORY, encoding="utf-8") as fh:
        history = fh.read()
    # History page reads newest first; the index timeline stays chronological.
    body = "\n\n".join(render_production(p) for p in reversed(prods))
    history = replace_block(history, "PRODUCTIONS", body, "history.html")
    with open(HISTORY, "w", encoding="utf-8") as fh:
        fh.write(history)

    with open(INDEX, encoding="utf-8") as fh:
        index = fh.read()
    index = replace_block(index, "TIMELINE", render_timeline(prods), "index.html")
    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(index)

    print("wrote history.html (%d productions) and the index.html timeline" % len(prods))


if __name__ == "__main__":
    main()
