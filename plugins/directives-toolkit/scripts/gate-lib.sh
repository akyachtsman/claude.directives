# gate-lib.sh -- the command parsing push-gate.sh and wait-gate.sh share.
# SOURCED, never run: both gates load it from their own directory, so it ships
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

# gate_json_string <payload> <key>: print the first `"<key>": "..."` string in
# the payload, decoded -- the no-jq reader. <key> is a plain identifier.
gate_json_string() {
  printf '%s' "$1" \
      | sed -nE 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' | head -1 \
      | awk 'BEGIN { ORS = "" } {
          s = $0; n = length(s); out = ""
          for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (c == "\\" && i < n) {
              d = substr(s, ++i, 1)
              if (d == "n") out = out "\n"; else if (d == "t") out = out "\t"
              else if (d == "r") out = out "\r"
              else if (d == "\"" || d == "\\" || d == "/") out = out d
              else out = out "\\" d
            } else out = out c
          }
          print out
        }'
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
gate_strip_quotes() {
  printf '%s' "$1" | awk '
  BEGIN { RS = "\001" }
  {
    gsub(/\\\n/, " ")
    out = ""; q = ""; buf = ""
    n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (q == "") {
        if (c == "\\" && i < n) { out = out c substr($0, i + 1, 1); i++ }
        else if (c == "\047" || c == "\"") { q = c; buf = "" } else { out = out c }
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
