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
# Audit 2026-10-11 (M-13), with three parser differentials a security review
# found in its first draft folded in. The gates stay speed bumps, not
# boundaries; each of these is a cheap close of an accidental false verdict:
#  - `$(` inside double quotes opens a nested COMMAND context, parsed like the
#    top level until its `)`, so the rules below apply inside
#    `"$(cat <<'EOF' ... )"` too.
#  - a HEREDOC body is not command text. The operator is recognised only in
#    unquoted, non-comment, non-arithmetic text (`<<` inside quotes, a comment,
#    `$((...))` or `((...))` is not one); its body starts after the next
#    unquoted newline. Under a quoted delimiter (`<<'EOF'`, `<<"EOF"`, `<<\EOF`)
#    the body is inert and dropped; under a bare one its quote characters are
#    literal, so they are removed and the rest (where a live `$(...)` could sit)
#    is kept. With no terminator line, nothing is dropped.
#  - an unquoted `#` begins a COMMENT, dropped to the end of its line, only at a
#    real word boundary: start of a command context, or after unescaped,
#    unquoted whitespace, `;`, `&`, `|`, `(` or a newline. Any other character,
#    an escaped character or a quote span clears the boundary (`\ #` and
#    `"a b"#` are mid-word, as bash reads them).
#  - outside quotes, a backslash before a word character is removed as bash
#    removes it (`\main` is `main`). `$'...'` (ANSI-C quoting) is its own quote
#    state: a backslash escapes the next character, so `\'` does not end it, and
#    the span is then treated as a single-quoted one.
gate_strip_quotes() {
  printf '%s' "$1" | awk '
  function close_span(   q, b) {
    q = Q[sp]; b = BUF[sp]
    if (b !~ /[[:space:]]/ || (q == "\"" && b ~ /[$`]/)) OUT[sp] = OUT[sp] b
    Q[sp] = ""; BUF[sp] = ""; WB[sp] = 0
  }
  # Consume the pending heredoc bodies, starting at index i (the line after the
  # operator line). Returns where parsing resumes; with any terminator missing,
  # nothing is consumed.
  function heredocs(i,   k, j, e, ln, t, body, found, start) {
    start = i
    for (k = 1; k <= nh; k++) {
      j = i; body = ""; found = 0
      while (j <= n) {
        e = index(substr(s, j), "\n")
        ln = e ? substr(s, j, e - 1) : substr(s, j)
        t = ln; if (HT[k]) sub(/^\t+/, "", t)
        j = e ? j + e : n + 1
        if (t == HD[k]) { found = 1; break }
        body = body ln "\n"
      }
      if (!found) { nh = 0; return start }
      if (!HQ[k]) { gsub(/[\047"]/, "", body); KEEP[k] = body } else KEEP[k] = ""
      i = j
    }
    for (k = 1; k <= nh; k++) OUT[sp] = OUT[sp] KEEP[k]
    nh = 0; return i
  }
  BEGIN { RS = "\001" }
  {
    gsub(/\\\n/, " ")
    s = $0; n = length(s)
    sp = 0; OUT[0] = ""; Q[0] = ""; BUF[0] = ""; PD[0] = 0; WB[0] = 1; nh = 0
    i = 1
    while (i <= n) {
      c = substr(s, i, 1); c2 = substr(s, i + 1, 1); q = Q[sp]
      if (q == "") {
        if (c == "\\" && i < n) {
          OUT[sp] = OUT[sp] (c2 ~ /[A-Za-z0-9_]/ ? c2 : c c2); WB[sp] = 0; i += 2; continue
        }
        if (c == "#" && WB[sp]) { while (i <= n && substr(s, i, 1) != "\n") i++; continue }
        if (c == "\n") {
          OUT[sp] = OUT[sp] c; WB[sp] = 1; i++
          if (nh) i = heredocs(i)
          continue
        }
        if (c == "$" && c2 == "\047") { Q[sp] = "a"; BUF[sp] = ""; i += 2; continue }
        if (c == "\047" || c == "\"") { Q[sp] = c; BUF[sp] = ""; i++; continue }
        if (substr(s, i, 3) == "$((" || (c == "(" && c2 == "(" && WB[sp])) {
          st = i; i += (c == "$" ? 3 : 2); d = 2
          while (i <= n && d > 0) { x = substr(s, i, 1); if (x == "(") d++; else if (x == ")") d--; i++ }
          OUT[sp] = OUT[sp] substr(s, st, i - st); WB[sp] = 0; continue
        }
        if (c == "<" && c2 == "<" && substr(s, i + 2, 1) != "<" && (i == 1 || substr(s, i - 1, 1) != "<")) {
          j = i + 2; tabs = 0
          if (substr(s, j, 1) == "-") { tabs = 1; j++ }
          while (substr(s, j, 1) ~ /[ \t]/) j++
          w = ""
          while (j <= n && substr(s, j, 1) !~ /[ \t\n;&|()<>]/) { w = w substr(s, j, 1); j++ }
          if (w != "") { dl = w; gsub(/[\047"\\]/, "", dl); nh++; HD[nh] = dl; HQ[nh] = (dl != w); HT[nh] = tabs }
          OUT[sp] = OUT[sp] substr(s, i, j - i); WB[sp] = 0; i = j; continue
        }
        if (c == "(") PD[sp]++
        if (c == ")") {
          if (PD[sp] > 0) PD[sp]--
          else if (sp > 0) { inner = OUT[sp]; sp--; BUF[sp] = BUF[sp] "$(" inner ")"; i++; continue }
        }
        OUT[sp] = OUT[sp] c; WB[sp] = (c ~ /[ \t;&|(]/) ? 1 : 0; i++; continue
      }
      if (q == "\"") {
        if (c == "\\" && i < n) { BUF[sp] = BUF[sp] c c2; i += 2; continue }
        if (c == "$" && c2 == "(" && substr(s, i + 2, 1) != "(") {
          sp++; OUT[sp] = ""; Q[sp] = ""; BUF[sp] = ""; PD[sp] = 0; WB[sp] = 1; i += 2; continue
        }
        if (c == "\"") { close_span(); i++; continue }
        BUF[sp] = BUF[sp] c; i++; continue
      }
      if (q == "a") {
        if (c == "\\" && i < n) { BUF[sp] = BUF[sp] c c2; i += 2; continue }
        if (c == "\047") { close_span(); i++; continue }
        BUF[sp] = BUF[sp] c; i++; continue
      }
      if (c == "\047") { close_span(); i++; continue }
      BUF[sp] = BUF[sp] c; i++
    }
    # Whatever is still open keeps its text: a parse oddity errs toward checking.
    while (1) {
      if (Q[sp] != "") OUT[sp] = OUT[sp] BUF[sp]
      if (sp == 0) break
      inner = OUT[sp]; sp--; BUF[sp] = BUF[sp] "$(" inner
    }
    printf "%s", OUT[0]
  }'
}
