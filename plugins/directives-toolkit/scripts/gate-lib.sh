# gate-lib.sh -- the parsing the toolkit's hook scripts share: push-gate.sh and
# wait-gate.sh (the command), pages-edit-gate.sh (the edited path).
# SOURCED, never run: each gate loads it from its own directory, so it ships
# wherever they do. Each gate fails OPEN when it cannot load this file, as it
# does on any other parse problem -- a gate must never break unrelated Bash calls.
#
# One copy, because two drifted: wait-gate kept the sed quote-stripping that
# push-gate replaced (audit, 2026-10-06), so the apostrophe defect fixed in one
# stayed live in the other.

# gate_command <hook-payload>: print the Bash tool's command string (jq when
# available, sed+awk fallback). Non-zero when jq fails to parse the payload.
# The fallback must read the JSON string as JSON does: it once stopped at the
# first escaped quote, so a commit with a quoted message followed by a push to
# main reached the gate cut short at the message and was allowed (audit,
# 2026-10-09). So the match takes escaped characters whole, and awk decodes the
# escapes after it.
gate_command() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -r '.tool_input.command // empty' 2>/dev/null
  else
    gate_json_string "$1" command
  fi
}

# gate_json_string <payload> <key>: print the FIRST `"<key>": "..."` string in
# the payload, decoded -- the no-jq reader. <key> is a plain identifier.
# The first, because tool_input precedes tool_response in a hook payload. The
# sed it replaced led with a greedy `.*`, so it returned the LAST match while
# this comment said "first" (audit 2026-10-11, M-11): awk's match() is
# leftmost, and the string is then walked to its closing quote, escapes whole.
gate_json_string() {
  printf '%s' "$1" | awk -v key="$2" 'BEGIN { RS = "\001"; ORS = "" } {
    if (!match($0, "\"" key "\"[[:space:]]*:[[:space:]]*\"")) exit
    s = substr($0, RSTART + RLENGTH); n = length(s); out = ""
    for (i = 1; i <= n; i++) {
      c = substr(s, i, 1)
      if (c == "\"") { print out; exit }
      if (c == "\\" && i < n) {
        d = substr(s, ++i, 1)
        if (d == "n") out = out "\n"; else if (d == "t") out = out "\t"
        else if (d == "r") out = out "\r"
        else if (d == "\"" || d == "\\" || d == "/") out = out d
        else out = out "\\" d
      } else out = out c
    }
  }'
}

# gate_served <path>: true when GitHub Pages serves <path> to users -- the ONE
# pattern for a served file (pages-edit-gate.sh). <path> is relative to the
# repository root when the gate could resolve it, else absolute. HTML, JS, CSS,
# SVG and web manifests anywhere, since the default downstream layout serves
# the repository root; never under .github/, .claude/, templates/ or
# node_modules/ (CI, settings, this repo's scaffolding, dependencies).
gate_served() {
  printf '%s\n' "$1" | grep -qE '\.(html?|m?js|css|svg|webmanifest)$' \
    && ! printf '%s\n' "$1" | grep -qE '(^|/)(\.github|\.claude|templates|node_modules)/'
}

# gate_strip_quotes <command>: print the command with its quoted segments
# stripped, so message text never influences a gate's verdict.
#
# ONE left-to-right pass that tracks quote state, because the spans interact:
# the earlier sed passes stripped single-quoted spans before double-quoted ones,
# so an apostrophe inside a double-quoted message ("fix the user's bug") opened a
# "single-quoted span" that ran to the next apostrophe and swallowed the command
# between them -- exit 0 on an ordinary commit (audit, 2026-10-06). The rules,
# applied in the order bash reads them:
#  - a single-WORD quoted token is unquoted (`push origin "main"` cannot hide the
#    ref, and `sleep "30"` reads as the 30-second sleep it is);
#  - a single-quoted span is inert, so one containing whitespace is dropped;
#  - a double-quoted span containing `$` or a backtick may hold a live command
#    substitution (bash expands both inside double quotes), so it is KEPT --
#    `sleep "$(printf %s 30)"` is a 30-second sleep (Codex, #396); any other
#    multi-word double-quoted span is message text and is dropped;
#  - a backslash outside quotes escapes the next character, as in bash, so `\"`
#    is a literal quote, not the start of a span (Codex, #396);
#  - an unterminated quote keeps its text, so a parse oddity errs toward checking.
# A backslash-newline continuation is joined first: bash reads it as one command.
#
# Three more shapes, each a cheap close of an accidental false verdict (audit
# 2026-10-11, M-13; the gates stay speed bumps, not boundaries):
#  - a HEREDOC body is not command text. Under a quoted delimiter (`<<'EOF'`,
#    `<<"EOF"`) the body is inert and is dropped; under a bare one its quote
#    characters are literal, so they are removed and the rest (where a live
#    `$(...)` could sit) is kept. Before this, `Use a 5" screen` or `the user's
#    fix` in a commit heredoc opened a quote span that swallowed the push after
#    it. A delimiter with no terminator line drops nothing.
#  - an unquoted `#` at the start of a word begins a COMMENT, dropped to the end
#    of its line: `git status # don't worry` opened a span on the apostrophe, and
#    `git push origin claude/fix # main` was blocked on the comment's word.
#  - outside quotes, a backslash before a word character is removed as bash
#    removes it (`\main` is `main`), and `$'...'` (ANSI-C quoting) loses its `$`
#    (`$'main'` is `main`).
gate_strip_quotes() {
  printf '%s' "$1" | awk '
  BEGIN { RS = "\001" }
  {
    gsub(/\\\n/, " ")
    # ---- heredoc bodies --------------------------------------------------
    nl = split($0, L, "\n"); text = ""; i = 1
    while (i <= nl) {
      line = L[i]; text = text (i > 1 ? "\n" : "") line; i++
      if (!match(line, /(^|[^<])<<-?[[:space:]]*[\047"]?[A-Za-z_][A-Za-z_0-9]*[\047"]?/)) continue
      op = substr(line, RSTART, RLENGTH); sub(/^[^<]?<<-?[[:space:]]*/, "", op)
      quoted = (op ~ /^[\047"]/); delim = op; gsub(/[\047"]/, "", delim)
      tabs = (substr(line, RSTART, RLENGTH) ~ /<<-/)
      end = 0
      for (j = i; j <= nl; j++) { t = L[j]; if (tabs) sub(/^\t+/, "", t); if (t == delim) { end = j; break } }
      if (!end) continue
      for (j = i; j < end; j++) {
        if (!quoted) { b = L[j]; gsub(/[\047"]/, "", b); text = text "\n" b }
      }
      text = text "\n"; i = end + 1
    }
    $0 = text
    # ---- quotes, comments, escapes ---------------------------------------
    out = ""; q = ""; buf = ""
    n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (q == "") {
        if (c == "\\" && i < n) {
          d = substr($0, i + 1, 1); i++
          out = out (d ~ /[A-Za-z0-9_]/ ? d : c d)
        }
        else if (c == "#" && (out == "" || out ~ /[[:space:];&|(]$/)) {
          while (i < n && substr($0, i + 1, 1) != "\n") i++
        }
        else if (c == "\047" || c == "\"") {
          if (c == "\047" && out ~ /\$$/) out = substr(out, 1, length(out) - 1)
          q = c; buf = ""
        } else { out = out c }
      } else if (q == "\"" && c == "\\" && i < n) {
        buf = buf c substr($0, i + 1, 1); i++
      } else if (c == q) {
        if (buf !~ /[[:space:]]/ || (q == "\"" && buf ~ /[$`]/)) out = out buf
        q = ""; buf = ""
      } else {
        buf = buf c
      }
    }
    if (q != "") out = out buf
    printf "%s", out
  }'
}
