#!/usr/bin/env python3
"""Trigger evals for the toolkit's auto-skills.

An auto-skill fires on description match, so nothing in CI proves it still
fires. This runs each case as a real `claude -p` session and asserts whether
the Skill tool was invoked for the skill under test.

Why not `claude plugin eval`: that CLI is the native harness and is preferred
the moment it is available, but it is gated behind early access and currently
refuses to run (EXPORTS.json -> considered). Why not skill-creator's
run_eval.py: its detector returns on the FIRST tool use of the FIRST assistant
message, so any preamble or another tool first reads as "no trigger" -- it
scored a known-good skill 0.00 on a query it certainly handles.

Cases carry their own fixture files. A query naming inputs that do not exist
gets a clarifying question rather than a skill, which scores as a false
negative and tests nothing.

Costs real tokens. Not wired into CI; run it when a skill's description changes.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

def run_case(skill, case, timeout):
    work = tempfile.mkdtemp(prefix="trigeval-")
    try:
        for name, body in (case.get("files") or {}).items():
            with open(os.path.join(work, name), "w") as fh:
                fh.write(body)
        env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
        proc = subprocess.run(
            ["claude", "-p", case["query"], "--output-format", "stream-json", "--verbose"],
            cwd=work, env=env, capture_output=True, text=True, timeout=timeout)
        fired = False
        for line in proc.stdout.splitlines():
            try: ev = json.loads(line)
            except Exception: continue
            if not isinstance(ev, dict): continue
            msg = ev.get("message")
            if not isinstance(msg, dict): continue
            content = msg.get("content")
            if not isinstance(content, list): continue
            for c in content:
                if not isinstance(c, dict) or c.get("type") != "tool_use": continue
                if c.get("name") == "Skill" and skill in json.dumps(c.get("input") or {}):
                    fired = True
        return {"query": case["query"], "should_trigger": case["should_trigger"],
                "fired": fired, "pass": fired == case["should_trigger"]}
    except subprocess.TimeoutExpired:
        return {"query": case["query"], "should_trigger": case["should_trigger"],
                "fired": None, "pass": False, "error": "timeout"}
    finally:
        shutil.rmtree(work, ignore_errors=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skill", required=True, help="skill name as it appears in the Skill call")
    ap.add_argument("--cases", required=True)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--runs", type=int, default=3, help="runs per case; triggering is probabilistic")
    ap.add_argument("--threshold", type=float, default=0.67,
                    help="minimum fire rate for a should_trigger case")
    a = ap.parse_args()
    cases = json.load(open(a.cases))
    # Triggering is probabilistic: the same query can fire on one run and not the
    # next. A single run cannot tell "never fires" from "fires sometimes", so each
    # case runs N times and is scored as a RATE against a threshold.
    jobs = [(c, i) for c in cases for i in range(a.runs)]
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        raw = list(ex.map(lambda j: run_case(a.skill, j[0], a.timeout), jobs))
    by_query = {}
    for (c, _), r in zip(jobs, raw):
        by_query.setdefault(c["query"], {"case": c, "runs": []})["runs"].append(r)
    failed = 0
    for q, agg in by_query.items():
        want = agg["case"]["should_trigger"]
        fires = sum(1 for r in agg["runs"] if r["fired"])
        rate = fires / len(agg["runs"])
        ok = (rate >= a.threshold) if want else (rate == 0.0)
        if not ok: failed += 1
        print(f"  [{'PASS' if ok else 'FAIL'}] rate={rate:.2f} ({fires}/{len(agg['runs'])}) "
              f"expect={str(want):5} {q[:52]}")
    print(f"  -> {len(by_query)-failed}/{len(by_query)} passed")
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
