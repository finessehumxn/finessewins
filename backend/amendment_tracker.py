"""
FinesseWins — Amendment Tracker
Monitors SAM.gov and AZ APP portal for solicitation amendments.
In production: run as a background job every 6 hours.
"""
from datetime import datetime
from typing import List, Optional
import httpx, os

SAM_API_KEY = os.environ.get("SAM_API_KEY", "")

class AmendmentTracker:
    def __init__(self):
        self.tracked = {}  # solicitation_number -> {amendments: [], last_checked: str}

    async def check_amendments(self, solicitation_number: str) -> dict:
        """Check SAM.gov for new amendments on a solicitation"""
        known = self.tracked.get(solicitation_number, {})
        known_amends = known.get("amendments", [])

        new_amendments = []
        if SAM_API_KEY:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        "https://api.sam.gov/opportunities/v2/search",
                        params={
                            "api_key": SAM_API_KEY,
                            "solicitationNumber": solicitation_number,
                            "limit": 10,
                        }
                    )
                    data = resp.json()
                    for opp in data.get("opportunitiesData", []):
                        amend_num = opp.get("amendmentNumber")
                        if amend_num and amend_num not in known_amends:
                            new_amendments.append({
                                "amendment_number": amend_num,
                                "title": opp.get("title"),
                                "posted_date": opp.get("postedDate"),
                                "description": opp.get("description", "")[:200],
                                "deadline": opp.get("responseDeadLine"),
                            })
            except Exception as e:
                print(f"Amendment check error: {e}")

        self.tracked[solicitation_number] = {
            "amendments": known_amends + [a["amendment_number"] for a in new_amendments],
            "last_checked": datetime.utcnow().isoformat(),
        }

        return {
            "solicitation_number": solicitation_number,
            "new_amendments": new_amendments,
            "total_known": len(self.tracked[solicitation_number]["amendments"]),
            "last_checked": self.tracked[solicitation_number]["last_checked"],
            "has_new": len(new_amendments) > 0,
        }

    def track(self, solicitation_number: str, known_amendments: List[str] = None):
        """Start tracking a solicitation"""
        if solicitation_number not in self.tracked:
            self.tracked[solicitation_number] = {
                "amendments": known_amendments or [],
                "last_checked": datetime.utcnow().isoformat(),
            }

tracker = AmendmentTracker()
