#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

Status = Literal["todo", "in_progress", "done", "blocked"]


@dataclass(frozen=True)
class PhaseInfo:
    code: str  # "00".."21"
    label: str
    spec_file: str
    evidence: list[str]


PHASES: list[PhaseInfo] = [
    PhaseInfo("00", "scaffold", "specs/phase-00-scaffold.md", ["worker", "web", "runner"]),
    PhaseInfo("01", "database", "specs/phase-01-database.md", ["worker/migrations/0001_init.sql"]),
    PhaseInfo("02", "auth", "specs/phase-02-auth.md", ["worker/src", "web/app/(auth)"]),
    PhaseInfo("03", "billing", "specs/phase-03-billing.md", ["worker/src/routes"]),
    PhaseInfo("04", "accounts", "specs/phase-04-accounts.md", ["worker/src/routes", "web/app/(dashboard)/accounts"]),
    PhaseInfo("05", "warmup engine", "specs/phase-05-warmup-engine.md", ["runner/main.py", "runner/warmup.py"]),
    PhaseInfo("06", "dashboard UI", "specs/phase-06-dashboard-ui.md", ["web/app/(dashboard)"]),
    PhaseInfo("07", "analytics", "specs/phase-07-analytics.md", ["worker/src/routes", "web/app/(dashboard)/analytics"]),
    PhaseInfo("08", "landing", "specs/phase-08-landing.md", ["web/app/page.tsx", "web/components/landing"]),
    PhaseInfo("09", "AI dialogs", "specs/phase-09-ai-dialogs.md", ["runner/ai_client.py"]),
    PhaseInfo("10", "tokens", "specs/phase-10-tokens.md", ["worker/src/routes/tokens.ts"]),
    PhaseInfo("11", "account detail", "specs/phase-11-account-detail.md", ["web/app/(dashboard)/accounts/account-sheet.tsx"]),
    PhaseInfo("12", "proxies", "specs/phase-12-proxies.md", ["worker/src/routes/proxies.ts", "web/app/(dashboard)/proxies"]),
    PhaseInfo("13", "deploy", "specs/phase-13-deploy.md", [".github/workflows"]),
    PhaseInfo("14", "projects", "specs/phase-14-projects.md", ["worker/src/routes/projects.ts", "web/app/(dashboard)/projects"]),
    PhaseInfo("15", "account import", "specs/phase-15-account-import.md", ["worker/src/routes/accounts-import.ts"]),
    PhaseInfo("16", "outreach", "specs/phase-16-outreach-broadcast.md", ["worker/src/routes/broadcasts.ts"]),
    PhaseInfo("17", "automation + notifications", "specs/phase-17-automation-notifications.md", ["worker/src/routes/notifications.ts"]),
    PhaseInfo("18", "token metering", "specs/phase-18-token-metering.md", ["worker/migrations/0010_token_usage.sql"]),
    PhaseInfo("19", "proxy checker", "specs/phase-19-proxy-checker.md", ["runner/proxy_checker.py"]),
    PhaseInfo("20", "AI parsing", "specs/phase-20-ai-parsing.md", ["worker/src/routes/parsing.ts"]),
    PhaseInfo("21", "quality & launch", "specs/phase-21-quality-launch.md", ["specs/phase-21-quality-launch.md"]),
]


def load_status(path: Path) -> dict:
    return json.loads(path.read_text("utf-8"))


def suggest_next(phases: dict[str, Status]) -> str | None:
    for p in PHASES:
        if phases.get(p.code) != "done":
            return p.code
    return None


def check_evidence(repo: Path, phase_code: str) -> list[str]:
    p = next(x for x in PHASES if x.code == phase_code)
    missing = []
    for rel in p.evidence:
        if not (repo / rel).exists():
            missing.append(rel)
    return missing


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    status_path = repo / "PHASE_STATUS.json"
    if not status_path.exists():
        raise SystemExit("PHASE_STATUS.json not found")

    s = load_status(status_path)
    phases = s.get("phases", {})
    next_code = suggest_next(phases)

    print(f"project: {s.get('project')}")
    print(f"updated_at: {s.get('updated_at')}")
    print(f"last_completed_phase: {s.get('last_completed_phase')}")
    print(f"current_phase: {s.get('current_phase')}")
    print(f"next_phase: {next_code}")

    if next_code:
        missing = check_evidence(repo, next_code)
        if missing:
            print("evidence_missing:")
            for m in missing:
                print(f"  - {m}")


if __name__ == "__main__":
    main()

