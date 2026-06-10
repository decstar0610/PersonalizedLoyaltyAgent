"""Central configuration: NVIDIA NIM OpenAI-compatible client and model names.

See docs/PRD.md section 6 (Tech Stack). The NVIDIA NIM API is OpenAI-compatible,
so we use the `openai` SDK pointed at the NIM endpoint.
"""

import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# --- NVIDIA NIM endpoint & credentials ---
NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")

# --- Data source (configurable) ---
# Point CUSTOMERS_FILE at either the curated demo set (default) or a large
# synthetic set (data/customers_large.json) without changing any code.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CUSTOMERS_FILE = os.path.join(PROJECT_ROOT, "data", "customers.json")
# `or` (not getenv's default) so a present-but-empty value falls back too.
CUSTOMERS_FILE = os.getenv("CUSTOMERS_FILE") or DEFAULT_CUSTOMERS_FILE

# --- Models named in the PRD (section 6) ---
LLM_MODEL = "meta/llama-3.1-70b-instruct"
EMBEDDING_MODEL = "nvidia/nv-embedqa-e5-v5"


def get_client() -> OpenAI:
    """Return an OpenAI-compatible client configured for NVIDIA NIM.

    Raises a clear error if the API key is missing so failures are obvious
    rather than surfacing as opaque 401s from the API.
    """
    if not NVIDIA_API_KEY:
        raise RuntimeError(
            "NVIDIA_API_KEY is not set. Copy .env.example to .env and add your key "
            "from https://build.nvidia.com/"
        )
    return OpenAI(base_url=NIM_BASE_URL, api_key=NVIDIA_API_KEY)
