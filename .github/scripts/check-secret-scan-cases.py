#!/usr/bin/env python3
"""Pinned cases for the secret scan itself: templates/actions/secret-scan/action.yml.

WHY THIS EXISTS. check-secret-scan.js proves the two copies of the pattern are
EQUAL; nothing proved either one CATCHES anything. This repo holds no secret,
so the scan prints the same clean result whether its pattern works or matches
nothing at all -- the fail-open family (#323). Downstream pilots found three
real holes that way (claude.trading, claude.prop, 2026-10-13): an Anthropic key
carries hyphens the generic sk- form refuses, nothing matched a private-key
header, and the pathspec skipped *.sql and *.jsonl.

Each case writes ONE file into a scratch git repository and runs the action's
own `run:` script there, read out of the action.yml under test and run as a
composite runs it (`bash --noprofile --norc -eo pipefail`). A secret must fail
the step AND be named by file; the matched line must never be printed (the
`-l` note in the action). Every catch has a twin that must stay clean: a public
key or certificate header, an anon JWT, the pattern's own source text.

The fake credentials are ASSEMBLED at run time from fragments, so this file
holds none of them literally -- it is itself scanned by the step it tests.

Re-prove discrimination with a mutant (an older action.yml):

    SECRET_SCAN_BIN=/tmp/mutant/action.yml python3 .github/scripts/check-secret-scan-cases.py

Run: python3 .github/scripts/check-secret-scan-cases.py
"""

import sys

sys.dont_write_bytecode = True  # before the local imports below: no __pycache__ left in the tree

import base64
import json
import os
import subprocess
import tempfile

from cases_lib import Cases, bin_path, run, write_tree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ACTION = bin_path("SECRET_SCAN_BIN",
                  os.path.join(ROOT, "templates", "actions", "secret-scan", "action.yml"))
sys.path.insert(0, os.path.join(ROOT, "templates", "scripts"))
import gh_yaml  # noqa: E402  (after the path insert)


# ── fake credentials, assembled so no literal sits in this file ─────────────
def b64url(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode()).decode().rstrip("=")


def jwt(role):
    return ".".join((b64url({"alg": "HS256", "typ": "JWT"}),
                     b64url({"iss": "supabase", "ref": "abcdefghijklmnop", "role": role}),
                     "s1gnatureS1gnatureS1gnature"))


DASHES = "-" * 5
ANT_KEY = "sk" + "-ant-api03-" + "Ab3_dE-fG8hI" * 8 + "-xYzAA"
OPENAI_KEY = "sk" + "-" + "A1b2C3d4" * 4


def header(kind):
    return f"{DASHES}BEGIN {kind}{DASHES}"


def pem(kind):
    return f"{header(kind)}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n{DASHES}END {kind}{DASHES}\n"


# (label, {path: text}, expect a hit?, file the hit must name)
CASES = [
    # ── the Anthropic form: hyphens and underscores after sk-ant- ───────────
    ("an Anthropic API key (sk-ant-api03-...) in a .js file — caught",
     {"src/config.js": f"export const key = '{ANT_KEY}';\n"}, True, "src/config.js"),
    ("...and in a .env file — caught",
     {".env": f"ANTHROPIC_API_KEY={ANT_KEY}\n"}, True, ".env"),
    # The generic form is NOT subsumed by the sk-ant- form, nor the reverse.
    ("a generic sk- key (letters and digits only) — still caught",
     {"src/config.py": f"KEY = '{OPENAI_KEY}'\n"}, True, "src/config.py"),
    ("an sk-ant- prefix with a short tail (prose) — clean",
     {"docs/keys.md": "Anthropic keys start `" + "sk" + "-ant-api03-…`.\n"}, False, None),
    # ── private-key headers ─────────────────────────────────────────────────
    *[(f"a private-key header ({kind}PRIVATE KEY{' BLOCK' if blk else ''}) — caught",
       {f"keys/k{i}.json": json.dumps({"private_key": pem(f"{kind}PRIVATE KEY{' BLOCK' if blk else ''}")}) + "\n"},
       True, f"keys/k{i}.json")
      for i, (kind, blk) in enumerate([("", False), ("RSA ", False), ("EC ", False), ("OPENSSH ", False),
                                       ("DSA ", False), ("ENCRYPTED ", False), ("PGP ", True)])],
    ("a PUBLIC KEY header — clean",
     {"keys/pub.json": json.dumps({"public_key": pem("PUBLIC KEY")}) + "\n"}, False, None),
    ("an RSA PUBLIC KEY header — clean",
     {"keys/rsapub.yml": "key: |\n  " + pem("RSA PUBLIC KEY").replace("\n", "\n  ") + "\n"}, False, None),
    ("a PGP PUBLIC KEY BLOCK header — clean",
     {"keys/pgp.md": pem("PGP PUBLIC KEY BLOCK")}, False, None),
    ("a CERTIFICATE header — clean",
     {"certs/ca.json": json.dumps({"ca": pem("CERTIFICATE")}) + "\n"}, False, None),
    # ── the pathspec: *.sql and *.jsonl ─────────────────────────────────────
    ("a service-role JWT in a .sql migration — caught",
     {"supabase/migrations/001_seed.sql": f"select set_config('app.key', '{jwt('service_role')}', false);\n"},
     True, "supabase/migrations/001_seed.sql"),
    ("an Anthropic key in a .jsonl log — caught",
     {"logs/run.jsonl": json.dumps({"event": "call", "key": ANT_KEY}) + "\n"}, True, "logs/run.jsonl"),
    ("a clean .sql file — clean",
     {"supabase/migrations/002.sql": "create table t (id int);\n"}, False, None),
    # ── the JWT forms the scan already had ──────────────────────────────────
    ("a service-role JWT in a .ts file — caught",
     {"src/admin.ts": f"const k = '{jwt('service_role')}';\n"}, True, "src/admin.ts"),
    ("an anon JWT — clean (it is public by design)",
     {"src/client.ts": f"const k = '{jwt('anon')}';\n"}, False, None),
]


def scan_script(action_path):
    with open(action_path, encoding="utf-8") as handle:
        doc = gh_yaml.load(handle, allow_anchors=False)
    return next(s["run"] for s in doc["runs"]["steps"] if s.get("name") == "Secret scan")


def scan(tmp, script, files, gitignore=None):
    repo = tempfile.mkdtemp(dir=tmp)
    subprocess.run(["git", "init", "-q", repo], check=True)
    write_tree(repo, files)
    if gitignore is not None:
        write_tree(repo, {".gitignore": gitignore})
    return run(["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script], cwd=repo)


def secrets_in(files):
    """Each line of the fixture that carries the credential, for the no-echo check."""
    return [line for text in files.values() for line in text.splitlines()
            if any(s in line for s in (ANT_KEY, OPENAI_KEY, "PRIVATE KEY", jwt("service_role")))]


def main():
    if not ACTION.is_file():
        print(f"CANNOT RUN: {ACTION} does not exist")
        return 1
    script = scan_script(ACTION)
    c = Cases("check-secret-scan-cases")
    with tempfile.TemporaryDirectory() as tmp:
        for label, files, hit, name in CASES:
            code, out = scan(tmp, script, files)
            if not hit:
                c.expect(label, code, out, 0)
                continue
            if not c.expect(label, code, out, 1, name):
                continue
            leaked = [line for line in secrets_in(files) if line.strip() and line.strip() in out]
            if leaked:
                c.fail(f"{label}: the matched line is not printed", f"printed: {leaked[0]!r}")
            else:
                c.ok(f"{label}: the matched line is not printed")
        # The pattern's own source text is regex-shaped and must not match itself:
        # a definition file that tripped the scan would fail every clean run.
        c.expect("the action's own pattern text, in a .md and a .yml — clean",
                 *scan(tmp, script, {"docs/scan.md": script, "ci/scan.yml": script}), 0)
        # git grep --untracked skips ignored files: a project keeps real keys in a
        # gitignored .env.local (#410), and a scan that read it failed every local run.
        c.expect("a key in a gitignored .env.local — not scanned",
                 *scan(tmp, script, {".env.local": f"ANTHROPIC_API_KEY={ANT_KEY}\n"}, ".env.local\n"), 0)
    return c.finish(f"{len(CASES) + 2} fixture trees scanned as the composite scans them.")


if __name__ == "__main__":
    sys.exit(main())
