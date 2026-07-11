"""
FinesseWins — Stripe Subscription Billing
Three tiers: Solo $47/mo, Pro $97/mo, Agency $297/mo
"""
import stripe
import os
from typing import Optional

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Free tier — what a signed-up user gets before subscribing.
FREE_MONTHLY_LIMIT = int(os.environ.get("FREE_MONTHLY_LIMIT", "2"))

PLANS = {
    "solo": {
        "name": "Solo",
        "price": 47,
        "price_id": os.environ.get("STRIPE_SOLO_PRICE_ID", "price_solo"),
        "features": [
            "5 proposals per month",
            "SAM.gov opportunity search",
            "Plain-English RFP explainer",
            "WOSB/MBE/Black-owned certification leverage",
            "Zero past performance mode",
            "Email support",
        ],
        "proposals_per_month": 5,
    },
    "pro": {
        "name": "Pro",
        "price": 97,
        "price_id": os.environ.get("STRIPE_PRO_PRICE_ID", "price_pro"),
        "features": [
            "20 proposals per month",
            "SAM.gov + AZ APP Portal search",
            "All Solo features",
            "Amendment tracking & alerts",
            "Capability statement generator",
            "Deadline reminders",
            "Priority support",
        ],
        "proposals_per_month": 20,
    },
    "agency": {
        "name": "Agency",
        "price": 297,
        "price_id": os.environ.get("STRIPE_AGENCY_PRICE_ID", "price_agency"),
        "features": [
            "Unlimited proposals",
            "All Pro features",
            "Multiple company profiles",
            "White-label capability statements",
            "API access",
            "Dedicated support",
            "Done-with-you onboarding call",
        ],
        "proposals_per_month": 999,
    },
    "org": {
        "name": "Organization",
        "price": 499,
        "price_id": os.environ.get("STRIPE_ORG_PRICE_ID", "price_org"),
        "audience": "Accelerators · SBDCs · MBDA · Supplier Diversity",
        "features": [
            "Everything in Agency",
            "Advisor Console — manage unlimited client businesses",
            "Per-client bid matching across every site",
            "Program impact reporting + CSV export",
            "Bid IQ winnability for your whole cohort",
            "Cohort onboarding & training",
            "Priority + dedicated success manager",
        ],
        "proposals_per_month": 999,
    },
}


async def create_checkout_session(
    plan_key: str,
    customer_email: str,
    success_url: str,
    cancel_url: str,
    user_id: Optional[str] = None,
) -> Optional[str]:
    """Create a Stripe Checkout session and return the URL.

    user_id is stamped onto the session (metadata + client_reference_id) so the
    webhook can attribute the subscription back to the right account.
    """
    if not stripe.api_key or stripe.api_key == "":
        return None  # Stripe not configured

    plan = PLANS.get(plan_key)
    if not plan:
        raise ValueError(f"Unknown plan: {plan_key}")

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="subscription",
        customer_email=customer_email or None,
        client_reference_id=user_id,
        line_items=[{
            "price": plan["price_id"],
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"plan": plan_key, "user_id": user_id or ""},
        subscription_data={"metadata": {"plan": plan_key, "user_id": user_id or ""}},
    )
    return session.url


async def create_portal_session(customer_id: str, return_url: str) -> Optional[str]:
    """Create a Stripe Customer Portal session for managing subscriptions"""
    if not stripe.api_key:
        return None
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def get_plans():
    return PLANS


def plan_limit(plan_key: Optional[str]) -> int:
    """Monthly proposal allowance for a plan key. Unknown/free → FREE_MONTHLY_LIMIT."""
    if not plan_key or plan_key == "free":
        return FREE_MONTHLY_LIMIT
    plan = PLANS.get(plan_key)
    return plan["proposals_per_month"] if plan else FREE_MONTHLY_LIMIT


def plan_key_from_price(price_id: Optional[str]) -> Optional[str]:
    """Reverse-map a Stripe price id back to our plan key."""
    if not price_id:
        return None
    for key, plan in PLANS.items():
        if plan["price_id"] == price_id:
            return key
    return None


def parse_webhook(payload: bytes, sig_header: Optional[str]) -> Optional[dict]:
    """Verify + parse a Stripe webhook. Returns the event dict, or None if the
    signature can't be verified (or Stripe isn't configured)."""
    if not STRIPE_WEBHOOK_SECRET:
        # Unverified fallback for local testing only.
        import json
        try:
            return json.loads(payload)
        except Exception:
            return None
    try:
        return stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        print(f"[stripe] webhook verification failed: {e}")
        return None
