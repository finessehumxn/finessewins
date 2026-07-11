"""
FinesseWins — Advisor / program impact reporting

Accelerators (APEX), SBDCs, MBDA Centers and supplier-diversity offices are
funded on OUTCOMES they must report to keep funding. This turns the client roster
an advisor manages into the exact metrics those reports need — served counts,
diversity breakdown, bids, wins, and contract dollars — plus a CSV export.
"""
from __future__ import annotations

import csv
import io
from typing import List

DIVERSE_CERTS = {"WOSB", "EDWOSB", "MBE", "8a", "8(a)", "Black-Owned", "Black Owned",
                 "DBE", "HUBZone", "SDVOSB", "SDB"}


def compute_impact(clients: List[dict]) -> dict:
    served = len(clients)
    bids = sum(int(c.get("bids_submitted") or 0) for c in clients)
    wins = sum(int(c.get("bids_won") or 0) for c in clients)
    dollars = sum(float(c.get("dollars_won") or 0) for c in clients)

    cert_counts: dict = {}
    diverse = 0
    for c in clients:
        certs = c.get("certifications") or []
        if any(x in DIVERSE_CERTS for x in certs):
            diverse += 1
        for x in certs:
            cert_counts[x] = cert_counts.get(x, 0) + 1

    stage_counts: dict = {}
    for c in clients:
        s = c.get("stage") or "lead"
        stage_counts[s] = stage_counts.get(s, 0) + 1

    naics = sorted({n for c in clients for n in (c.get("naics_codes") or [])})

    return {
        "clients_served": served,
        "diverse_clients": diverse,
        "diverse_pct": round(100 * diverse / served) if served else 0,
        "cert_breakdown": dict(sorted(cert_counts.items(), key=lambda kv: -kv[1])),
        "stage_breakdown": stage_counts,
        "bids_submitted": bids,
        "bids_won": wins,
        "win_rate_pct": round(100 * wins / bids) if bids else 0,
        "dollars_won": dollars,
        "naics_covered": naics,
    }


def impact_csv(clients: List[dict], org_name: str = "") -> io.StringIO:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"FinesseWins — Program Impact Report{(' · ' + org_name) if org_name else ''}"])
    w.writerow([])
    w.writerow(["Business", "Stage", "Certifications", "NAICS",
                "Bids Submitted", "Bids Won", "Contract $ Won", "Contact"])
    for c in clients:
        w.writerow([
            c.get("name", ""),
            c.get("stage", ""),
            "; ".join(c.get("certifications") or []),
            "; ".join(c.get("naics_codes") or []),
            int(c.get("bids_submitted") or 0),
            int(c.get("bids_won") or 0),
            f"{float(c.get('dollars_won') or 0):.2f}",
            c.get("contact_email", "") or "",
        ])
    impact = compute_impact(clients)
    w.writerow([])
    w.writerow(["TOTALS", "", f"{impact['diverse_clients']} diverse of {impact['clients_served']}", "",
                impact["bids_submitted"], impact["bids_won"], f"{impact['dollars_won']:.2f}", ""])
    w.writerow(["Diverse %", impact["diverse_pct"]])
    w.writerow(["Win rate %", impact["win_rate_pct"]])
    buf.seek(0)
    return buf
