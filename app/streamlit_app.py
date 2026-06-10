"""Streamlit demo: select a customer and view the generated loyalty journey.

See docs/PRD.md feature F6. Shows a customer dropdown, a generate button, and the
resulting journey, clearly indicating whether personalization was applied.
"""

import json
import os

import streamlit as st

from src import config
from src.agent import generate_journey


@st.cache_data
def load_customers() -> list[dict]:
    with open(config.CUSTOMERS_FILE, encoding="utf-8") as f:
        return json.load(f)


st.set_page_config(page_title="PS100 Loyalty Agent", page_icon="🎁")
st.title("🎁 PS100 — Personalized Loyalty Agent")
st.caption("Consent-aware loyalty journeys, powered by NVIDIA NIM + LangGraph.")

customers = load_customers()
st.caption(f"Data source: `{os.path.basename(config.CUSTOMERS_FILE)}` ({len(customers)} customers)")
options = {f"{c['customer_id']} — {c['name']} ({c['loyalty_tier']})": c for c in customers}

choice = st.selectbox("Select a customer", list(options.keys()))
customer = options[choice]

with st.expander("Customer profile"):
    st.write(f"**Tier:** {customer['loyalty_tier']}  |  **Points:** {customer['points']}")
    st.write(f"**Personalization consent:** {customer['consent_flags']['personalization']}")
    st.write("**Purchase history:**")
    st.dataframe(customer["purchase_history"], use_container_width=True)

if st.button("Generate loyalty journey", type="primary"):
    with st.spinner("Running the loyalty agent..."):
        try:
            result = generate_journey(customer["customer_id"])
        except Exception as exc:
            st.error(f"Journey generation failed: {exc}")
            st.stop()

    # Clearly show whether personalization was applied (PRD F2 differentiator).
    if result["personalization_applied"]:
        st.success("✅ Personalization APPLIED — consent granted.")
    else:
        st.warning("🔒 Personalization NOT applied — consent is off. Showing generic offer only.")

    journey = result["loyalty_journey"]
    st.subheader("Loyalty Journey")
    st.metric("Current tier", journey["current_tier"])
    st.write(f"**Recommended action:** {journey['recommended_action']}")

    if journey["rewards"]:
        st.write("**Rewards:**")
        for r in journey["rewards"]:
            st.write(f"- **{r['reward']}** — {r['reason']}")

    st.info(f"**Next best offer:** {journey['next_best_offer']}")
    st.write(f"**Message:** {journey['message']}")

    with st.expander("Raw JSON"):
        st.json(result)
