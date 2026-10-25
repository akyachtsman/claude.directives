#!/usr/bin/env bash
# house-style-inventory.sh — /design-intake → Move an existing project (#470):
# what stands between THIS project's stylesheets and the house style. Run from
# the project root, before step 1 (to learn what to rename) and after it (to
# prove nothing is left):
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/house-style-inventory.sh"
#
# WHY RENAMING, AND SO WHY THIS LIST. The house components.css and an older
# project stylesheet define the same class names (.btn, .card, .input, ...).
# Two routes were tried in #469 and failed review: swapping the files broke
# every screen not yet rebuilt, and loading the old files beside the house ones
# let the house rules win the cascade on every shared name, restyling those
# screens anyway. So step 1 renames each shared name in the project's own CSS,
# HTML and JS to legacy-<name>, and the two sets stop meeting. This script
# names the set; the usages in HTML and JS are the session's to find, because
# a class built by concatenation ('btn-' + kind) is visible only by reading.
#
# WHICH FILES. Every tracked *.css file is the project's own, except a
# styles/components.css that is byte-identical to the house template at the pin
# (once installed, it is the house's). A project's own styles/components.css
# (the older starter, customised) IS counted: step 1 moves it to
# styles/legacy.css.
#
# HOW A CLASS IS READ. Comments are dropped, then only selector text is read:
# the run before each `{` that is not an at-rule prelude (`@media (...) {`),
# so a declaration value (`url(x.png)`, `.5em`) is never taken for a class.
# Nested rules inside @media count. A dotted word inside an attribute selector
# (`[href$=".pdf"]`) would be read as a class: a spare line to dismiss, never
# a missed collision.
#
# Prints, in order:
#   pinned: <sha> (<where from>)
#   COLLISION: .<name> -- the house components.css defines it, and so do: <files>
#   TOKENS: the house token names no tracked stylesheet declares (or all are)
#   SUMMARY: N collision(s) ...
# Exit 0 no collision, 1 collisions found, 2 could not run.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "CANNOT RUN: refresh-lib.sh not loadable"; exit 2; }

# css_classes: read CSS on stdin, print each class name its selectors use.
css_classes() {
  tr '\r\n' '  ' | sed -E 's#/\*[^*]*\*+([^/*][^*]*\*+)*/# #g' \
    | { grep -oE '[^{};]*\{' || true; } \
    | sed -E 's/^[[:space:]]+//' | { grep -v '^@' || true; } \
    | { grep -oE '\.[A-Za-z_-][A-Za-z0-9_-]*' || true; } \
    | sed 's/^\.//' | LC_ALL=C sort -u
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "CANNOT RUN: not inside a git work tree -- run it from the project root"
  exit 2
fi
if ! refresh_pin; then
  echo "CANNOT RUN: no upstream SHA ($pin_from returned nothing usable)"
  exit 2
fi
echo "pinned: $pin ($pin_from)"
up=$(mktemp -d) || up=
if [ -z "$up" ] || ! refresh_fetch "$up" "$pin" \
   || ! house_css=$(git -C "$up" cat-file blob "$pin:templates/styles/components.css" 2>/dev/null) \
   || ! house_tok=$(git -C "$up" cat-file blob "$pin:templates/styles/tokens.css" 2>/dev/null); then
  [ -n "$up" ] && rm -rf "$up"
  echo "CANNOT RUN: the house styles at $pin could not be fetched -- nothing compared"
  exit 2
fi
house_blob=$(git -C "$up" rev-parse "$pin:templates/styles/components.css")
rm -rf "$up"
house_classes=$(printf '%s\n' "$house_css" | css_classes)

# name<TAB>file for every class every own stylesheet uses. Paths come NUL-
# separated, so a name with a space or newline stays one path.
own=$(mktemp) || { echo "CANNOT RUN: no scratch file"; exit 2; }
tok=$(mktemp) || { rm -f "$own"; echo "CANNOT RUN: no scratch file"; exit 2; }
nfiles=0
while IFS= read -r -d '' f; do
  [ -f "$f" ] || continue
  if [ "$f" = styles/components.css ] \
     && [ "$(git hash-object --no-filters -- "$f" 2>/dev/null)" = "$house_blob" ]; then
    continue   # the house file itself, installed verbatim
  fi
  nfiles=$((nfiles + 1))
  css_classes <"$f" | while IFS= read -r c; do printf '%s\t%s\n' "$c" "$f"; done >>"$own"
  refresh_token_names <"$f" >>"$tok"
done < <(git ls-files -z -- '*.css')

n=0
while IFS= read -r c; do
  [ -n "$c" ] || continue
  files=$(awk -F'\t' -v c="$c" '$1 == c { print $2 }' "$own" | LC_ALL=C sort -u | paste -sd ',' - | sed 's/,/, /g')
  [ -n "$files" ] || continue
  echo "COLLISION: .$c -- the house components.css defines it, and so do: $files"
  n=$((n + 1))
done <<<"$house_classes"

want=$(printf '%s\n' "$house_tok" | refresh_token_names)
lacks=$(LC_ALL=C comm -23 <(printf '%s\n' "$want") <(LC_ALL=C sort -u "$tok") | paste -sd ' ' -)
total=$(printf '%s\n' "$want" | grep -c .)
rm -f "$own" "$tok"
if [ -z "$lacks" ]; then
  echo "TOKENS: the project's stylesheets declare all $total house token names (the values are the project's)"
else
  echo "TOKENS: no tracked stylesheet declares $(wc -w <<<"$lacks" | tr -d ' ') of $total house token names: $lacks -- step 1 adds each to styles/tokens.css"
fi
[ -f styles/tokens.css ] || echo "TOKENS: there is no styles/tokens.css yet -- step 1 puts the project's tokens there"

if [ "$n" -eq 0 ]; then
  echo "SUMMARY: no collision -- $nfiles own stylesheet(s) share no class name with the house components.css at $pin"
  exit 0
fi
echo "SUMMARY: $n collision(s) in $nfiles own stylesheet(s) -- rename each to legacy-<name> in the project's CSS, HTML and JS (/design-intake -> Move an existing project)"
exit 1
