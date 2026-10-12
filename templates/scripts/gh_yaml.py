"""gh_yaml.py -- read a workflow's YAML the way GitHub does, not the way PyYAML does.

WHY. PyYAML resolves plain scalars by YAML 1.1; GitHub's runner resolves them
by YAML 1.2's core schema (actions/runner, src/Sdk/DTPipelines/Pipelines/
ObjectTemplating/YamlObjectReader.cs: MatchNull, MatchBoolean, MatchInteger,
MatchFloat, applied to PLAIN scalars only). They disagree on values a workflow
really holds:

    yes / no / on / off    1.1: booleans          GitHub: strings
    070                    1.1: octal 56          GitHub: 70
    080                    1.1: a string          GitHub: 80
    1e3                    1.1: a string          GitHub: 1000.0

So `on:` becomes the key True, `timeout-minutes: 070` a 56-minute bound, and
`include-hidden-files: yes` the boolean True. Each guard here met that class
on its own and fixed it its own way (#408, #430, #431); this module is the
one definition they share (audit 2026-10-11, I-24).

A sibling module, not a guard: a script that imports it finds it in its own
directory (Python puts a script's directory first on sys.path), here in
templates/scripts/ and downstream in .github/scripts/, where it is installed
because the callers that run its importers name it (see templates/workflows/
qa.yml, and /refresh-repo's derivation of a template script's local imports).

    loader()                   a SafeLoader class with the core schema
    loader(lenient_ints=True)  the same, plus PyYAML's 1.1-only integer forms
                               (`1_000`, `0b101`, `1:30`) read as integers.
                               check-job-bounds.py keeps that reading on purpose:
                               it has no evidence GitHub rejects those spellings,
                               and a red build over one nobody has observed costs
                               more than a missed one (owner, 2026-10-11).
    load(stream, ...)          yaml.load with that loader
    compose(stream)            the node tree, scalars tagged by the core schema
    github_int(text)           a scalar's integer value as GitHub reads it, or None
"""

import re

import yaml

# YAML 1.2 core-schema integers, exactly MatchInteger's four branches: decimal
# (leading zeros and all, so `070` is 70), signed decimal, `0x` hex, `0o` octal.
# No sign on the radix forms, and no `0b`: GitHub reads `-0x1A` and `0b1` as
# strings. Anchored: PyYAML calls .match() on implicit resolvers.
INT = re.compile(r"^(?:[-+]?[0-9]+|0x[0-9a-fA-F]+|0o[0-7]+)$")
BOOL = re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$")
NULL = re.compile(r"^(?:~|null|Null|NULL|)$")
FLOAT = re.compile(r"^(?:[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?"
                   r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$")
# PyYAML's own YAML 1.1 integer pattern (yaml/resolver.py), for lenient_ints.
INT_1_1 = re.compile(r"""^(?:[-+]?0b[0-1_]+
                    |[-+]?0[0-7_]+
                    |[-+]?(?:0|[1-9][0-9_]*)
                    |[-+]?0x[0-9a-fA-F_]+
                    |[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$""", re.X)


def github_int(text):
    """`text` as GitHub's runner reads a plain integer scalar, or None.
    Not stripped: a scalar's text has no surrounding space to strip."""
    if not INT.match(text):
        return None
    if text.startswith(("0x", "0o")):
        return int(text[2:], 16 if text[1] == "x" else 8)
    return int(text, 10)


def _build(lenient_ints):
    class Loader(yaml.SafeLoader):
        pass
    # Replace the 1.1 resolvers outright: adding to them would keep `yes`,
    # `on` and `no` booleans.
    Loader.yaml_implicit_resolvers = {}
    rules = [
        ("tag:yaml.org,2002:null", NULL, ["~", "n", "N", ""]),
        ("tag:yaml.org,2002:bool", BOOL, list("tTfF")),
        ("tag:yaml.org,2002:int", INT, list("-+0123456789")),
        ("tag:yaml.org,2002:float", FLOAT, list("-+.0123456789")),
    ]
    if lenient_ints:
        rules.append(("tag:yaml.org,2002:int", INT_1_1, list("-+0123456789")))
    for tag, pattern, first in rules:
        Loader.add_implicit_resolver(tag, pattern, first)

    def construct_int(loader, node):
        # The resolver half alone is not enough: SafeLoader's constructor reads
        # a leading 0 as octal, so `070` would still be 56 and `080` would raise.
        value = github_int(loader.construct_scalar(node))
        if value is not None:
            return value
        if lenient_ints:
            return yaml.SafeLoader.construct_yaml_int(loader, node)
        # Only an explicit `!!int` tag reaches here with a non-1.2 form.
        raise yaml.constructor.ConstructorError(
            None, None, f"{node.value!r} is not a YAML 1.2 integer", node.start_mark)

    Loader.add_constructor("tag:yaml.org,2002:int", construct_int)
    return Loader


_LOADERS = {False: _build(False), True: _build(True)}


def loader(lenient_ints=False):
    return _LOADERS[bool(lenient_ints)]


def load(stream, lenient_ints=False):
    """Load one YAML document as GitHub resolves it. Raises yaml.YAMLError."""
    return yaml.load(stream, Loader=loader(lenient_ints))


def compose(stream):
    """The node tree, scalars tagged by the core schema. Raises yaml.YAMLError."""
    return yaml.compose(stream, Loader=loader())
