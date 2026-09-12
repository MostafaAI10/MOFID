"""
Shared configuration for the Mofid backend.

All values can be overridden with environment variables so the same code runs
unchanged on a Colab prototype, a developer laptop, or the eventual single-box
classroom deployment (see the project proposal's roadmap).
"""

import os

# --- Ports ---
LLAMA_SERVER_PORT = int(os.environ.get("MOFID_LLAMA_PORT", 8081))
CHROMA_PORT = int(os.environ.get("MOFID_CHROMA_PORT", 8001))
API_PORT = int(os.environ.get("MOFID_API_PORT", 8082))
CHROMA_HOST = os.environ.get("MOFID_CHROMA_HOST", "localhost")

# --- Paths ---
MODEL_PATH = os.environ.get("MOFID_MODEL_PATH", "./models/Karnak.Q3_K_M.gguf")
CHROMA_DB_PATH = os.environ.get("MOFID_CHROMA_PATH", "./mofid_vectordb")
CONTENT_PATH = os.environ.get("MOFID_CONTENT_PATH", "./content/physics_grade12.json")

# --- RAG ---
EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-base"
COLLECTION_NAME = "physics_g12"
RELEVANCE_THRESHOLD = float(os.environ.get("MOFID_RELEVANCE_THRESHOLD", 0.42))
TOP_K = int(os.environ.get("MOFID_TOP_K", 2))

KARNAK_URL = f"http://localhost:{LLAMA_SERVER_PORT}/v1/chat/completions"

SYSTEM_PROMPT_TEMPLATE = (
    "أنت مفيد، مساعد تعليمي ذكي. أجب على سؤال الطالب معتمدًا فقط على المحتوى المرجعي "
    "المقدم أدناه. لا تستخدم أي معلومات خارج هذا المحتوى. أجب بإيجاز ووضوح باللغة العربية.\n\n"
    "المحتوى المرجعي:\n{context}"
)

REFUSAL_MESSAGE = "هذا السؤال غير موجود في المنهج الحالي. من فضلك اسأل معلمك."
