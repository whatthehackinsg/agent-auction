#!/usr/bin/env python3
"""Generate a markdown report from agent-onboarding research JSON results."""

import json
import os
import re
import yaml

# ── Configuration ──────────────────────────────────────────────────────────────

TOPIC = "Agent Onboarding for AI Agent Platforms"
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
FIELDS_PATH = os.path.join(os.path.dirname(__file__), "fields.yaml")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "report.md")

# TOC summary fields (user-selected)
TOC_FIELDS = ["type", "status", "human_involvement", "time_to_first_action"]

# Fields to skip when collecting "extra" fields
INTERNAL_FIELDS = {"_source_file", "uncertain"}
CATEGORY_KEYS = set()  # populated dynamically from fields.yaml

# Category display names and possible JSON key variants
CATEGORY_MAPPING = {
    "Basic Info": ["basic_info", "Basic Info"],
    "Onboarding Flow": ["onboarding_flow", "Onboarding Flow"],
    "Identity Model": ["identity_model", "Identity Model"],
    "Security": ["security", "Security"],
    "Off-chain / On-chain Linking": ["offchain_onchain_linking", "Off-chain / On-chain Linking"],
    "Delegation & Authorization": ["delegation_and_authorization", "Delegation & Authorization"],
    "Discovery & Interoperability": ["discovery_and_interoperability", "Discovery & Interoperability"],
    "Push/Pull Communication": ["push_pull_communication", "Push/Pull Communication"],
    "Trust & Reputation": ["trust_and_reputation", "Trust & Reputation"],
    "Payment & Economics": ["payment_and_economics", "Payment & Economics"],
    "Governance & Compliance": ["governance_and_compliance", "Governance & Compliance"],
}

# ── Helpers ────────────────────────────────────────────────────────────────────


def load_fields_yaml(path):
    """Return ordered list of (category_display_name, [field_names])."""
    with open(path) as f:
        raw = yaml.safe_load(f)
    categories = []
    for cat_key, field_list in raw.get("fields", {}).items():
        # Find display name
        display = cat_key
        for disp, variants in CATEGORY_MAPPING.items():
            if cat_key in variants:
                display = disp
                break
        CATEGORY_KEYS.add(cat_key)
        field_names = [fd["name"] for fd in field_list]
        categories.append((display, cat_key, field_names))
    return categories


def find_field(data, field_name, cat_key):
    """Look up a field value: first in category dict, then top-level, then traverse."""
    # 1) Try category sub-dict
    for variant in CATEGORY_MAPPING.get(
        next((d for d, vs in CATEGORY_MAPPING.items() if cat_key in vs), ""), [cat_key]
    ):
        if variant in data and isinstance(data[variant], dict):
            if field_name in data[variant]:
                return data[variant][field_name]
    # 2) Try top-level
    if field_name in data:
        return data[field_name]
    # 3) Traverse all nested dicts
    for k, v in data.items():
        if isinstance(v, dict) and field_name in v:
            return v[field_name]
    return None


def is_uncertain(field_name, value, uncertain_list):
    """Check if a field should be skipped."""
    if field_name in uncertain_list:
        return True
    if value is None or value == "":
        return True
    if isinstance(value, str) and "[uncertain]" in value:
        return True
    return False


def slugify(text):
    """Create markdown anchor slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s]+", "-", text)
    return text


def shorten_status(val):
    """Extract the short status prefix."""
    if not val:
        return "?"
    return val.split("(")[0].strip()


def shorten_human(val):
    """Extract the short human involvement prefix."""
    if not val:
        return "?"
    return val.split("(")[0].strip()


def shorten_time(val):
    """Extract the short time prefix."""
    if not val:
        return "?"
    return val.split("(")[0].strip()


def format_value(value, field_name=""):
    """Format a field value for markdown display."""
    if isinstance(value, list):
        if all(isinstance(v, dict) for v in value):
            lines = []
            for item in value:
                parts = [f"**{k}**: {v}" for k, v in item.items()]
                lines.append("- " + " | ".join(parts))
            return "\n".join(lines)
        elif len(value) <= 5 and all(isinstance(v, str) and len(v) < 60 for v in value):
            return ", ".join(str(v) for v in value)
        else:
            return "\n".join(f"- {v}" for v in value)
    elif isinstance(value, dict):
        parts = []
        for k, v in value.items():
            parts.append(f"**{k}**: {v}")
        return "; ".join(parts)
    else:
        text = str(value)
        # For long text, add blockquote formatting
        if len(text) > 300:
            # Split numbered lists
            if re.search(r"\d\)", text) or re.search(r"\d\.", text):
                # Try to split on numbered items
                parts = re.split(r"(?=\d+[\)\.]\s)", text)
                if len(parts) > 2:
                    return "\n".join(f"> {p.strip()}" for p in parts if p.strip())
            return f"> {text}"
        return text


# ── Main ───────────────────────────────────────────────────────────────────────


def main():
    categories = load_fields_yaml(FIELDS_PATH)

    # Collect all defined field names
    all_defined_fields = set()
    for _, _, fields in categories:
        all_defined_fields.update(fields)

    # Load all JSON results
    items = []
    for fname in sorted(os.listdir(RESULTS_DIR)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(RESULTS_DIR, fname)) as f:
            data = json.load(f)
        data["_source_file"] = fname
        items.append(data)

    # Normalize types for grouping
    def normalize_type(t):
        t = t.lower().strip()
        if "hybrid" in t:
            return "Hybrid"
        if "on-chain" in t and "off-chain" not in t:
            return "On-Chain"
        if t.startswith("on-chain"):
            return "On-Chain"
        if "off-chain" in t:
            return "Off-Chain"
        if "standard" in t:
            return "Standards / Specs"
        return "Other"

    type_order = {"On-Chain": 0, "Hybrid": 1, "Off-Chain": 2, "Standards / Specs": 3, "Other": 4}
    items.sort(key=lambda d: (
        type_order.get(normalize_type(d.get("basic_info", {}).get("type", "")), 99),
        d.get("basic_info", {}).get("name", ""),
    ))

    lines = []

    # ── Header ─────────────────────────────────────────────────────────────────
    lines.append(f"# {TOPIC} — Research Report")
    lines.append("")
    lines.append(f"> **{len(items)} platforms/protocols** researched across {len(categories)} field categories ({sum(len(fs) for _, _, fs in categories)} fields each)")
    lines.append(f">")
    lines.append(f"> Generated from structured JSON research data. Fields marked [uncertain] are excluded.")
    lines.append("")

    # ── Table of Contents ──────────────────────────────────────────────────────
    lines.append("## Table of Contents")
    lines.append("")

    current_type = None
    idx = 0
    for data in items:
        bi = data.get("basic_info", {})
        name = bi.get("name", "Unknown")
        typ = bi.get("type", "unknown")

        # Type section header
        type_label = normalize_type(typ)
        if type_label != current_type:
            current_type = type_label
            lines.append("")
            lines.append(f"### {current_type.title()}")
            lines.append("")

        idx += 1
        slug = slugify(name)
        status = shorten_status(bi.get("status", ""))
        human = shorten_human(find_field(data, "human_involvement", "onboarding_flow") or "")
        time_val = shorten_time(find_field(data, "time_to_first_action", "onboarding_flow") or "")

        lines.append(
            f"{idx}. [{name}](#{slug}) — `{status}` · {human} · ⏱ {time_val}"
        )

    lines.append("")

    # ── Detailed Sections ──────────────────────────────────────────────────────
    lines.append("---")
    lines.append("")

    for data in items:
        bi = data.get("basic_info", {})
        name = bi.get("name", "Unknown")
        uncertain_list = data.get("uncertain", [])
        source = data.get("_source_file", "")

        lines.append(f"## {name}")
        lines.append("")

        # Quick summary bar
        typ = bi.get("type", "?")
        status = shorten_status(bi.get("status", ""))
        ecosystem = bi.get("ecosystem", "")
        eco_short = ecosystem.split("(")[0].strip()[:60] if ecosystem else "—"
        lines.append(f"**Type**: `{typ}` · **Status**: `{status}` · **Ecosystem**: {eco_short}")
        lines.append("")

        # Each category
        for display_name, cat_key, field_names in categories:
            category_lines = []
            for fname in field_names:
                val = find_field(data, fname, cat_key)
                if is_uncertain(fname, val, uncertain_list):
                    continue
                if fname == "name":
                    continue  # already in header
                formatted = format_value(val, fname)
                label = fname.replace("_", " ").title()
                if formatted.startswith("\n") or formatted.startswith(">") or formatted.startswith("- "):
                    category_lines.append(f"**{label}**:\n{formatted}")
                else:
                    category_lines.append(f"**{label}**: {formatted}")

            if category_lines:
                lines.append(f"### {display_name}")
                lines.append("")
                for cl in category_lines:
                    lines.append(cl)
                    lines.append("")

        # Uncertain fields summary
        if uncertain_list:
            lines.append(f"### Uncertain Fields ({len(uncertain_list)})")
            lines.append("")
            for uf in uncertain_list:
                lines.append(f"- {uf}")
            lines.append("")

        lines.append("---")
        lines.append("")

    # ── Write output ───────────────────────────────────────────────────────────
    with open(OUTPUT_PATH, "w") as f:
        f.write("\n".join(lines))

    print(f"Report generated: {OUTPUT_PATH}")
    print(f"  Items: {len(items)}")
    print(f"  Categories: {len(categories)}")
    print(f"  Fields per item: {sum(len(fs) for _, _, fs in categories)}")


if __name__ == "__main__":
    main()
