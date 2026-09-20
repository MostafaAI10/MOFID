"""
Shared configuration for the Mofid backend.

All values can be overridden with environment variables so the same code runs
unchanged on a Colab prototype, a developer laptop, or the eventual single-box
classroom deployment (see the project proposal's roadmap).
"""

import os

os.environ.setdefault("HF_HUB_OFFLINE", "1")

# --- Ports ---
LLAMA_SERVER_PORT = int(os.environ.get("MOFID_LLAMA_PORT", 8081))
CHROMA_PORT = int(os.environ.get("MOFID_CHROMA_PORT", 8001))
API_PORT = int(os.environ.get("MOFID_API_PORT", 8082))
CHROMA_HOST = os.environ.get("MOFID_CHROMA_HOST", "127.0.0.1")

# --- Paths ---
MODEL_PATH = os.environ.get("MOFID_MODEL_PATH", "./models/Karnak.Q3_K_M.gguf")
CHROMA_DB_PATH = os.environ.get("MOFID_CHROMA_PATH", "./mofid_vectordb")
CONTENT_PATH = os.environ.get("MOFID_CONTENT_PATH", "./content/physics_grade12.json")
DOCUMENTS_DIR = os.environ.get("MOFID_DOCUMENTS_DIR", "./work/documents")
DOCUMENTS_DB_PATH = os.environ.get("MOFID_DOCUMENTS_DB_PATH", "./work/documents.sqlite3")
MAX_DOCUMENT_MB = int(os.environ.get("MOFID_DOC_MAX_MB", 50))

# --- RAG ---
EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-base"
COLLECTION_NAME = "physics_g12"
TOP_K = int(os.environ.get("MOFID_TOP_K", 2))

# The XLING pair applies when the question is not in the corpus language.
RELEVANCE_THRESHOLD = float(os.environ.get("MOFID_RELEVANCE_THRESHOLD", 0.46))
COVERAGE_THRESHOLD = float(os.environ.get("MOFID_COVERAGE_THRESHOLD", 0.20))
RELEVANCE_THRESHOLD_XLING = float(os.environ.get("MOFID_RELEVANCE_XLING", 0.55))
COVERAGE_THRESHOLD_XLING = float(os.environ.get("MOFID_COVERAGE_XLING", 0.10))

MAX_ANSWER_TOKENS = int(os.environ.get("MOFID_MAX_ANSWER_TOKENS", 200))
LLM_MODE = os.environ.get("MOFID_LLM_MODE", "live").lower()

KARNAK_URL = f"http://localhost:{LLAMA_SERVER_PORT}/v1/chat/completions"

# --- Teacher dashboard (FAQ aggregation from /ask logs) ---
FAQ_LOG_PATH = os.environ.get("MOFID_LOG_PATH", "./work/faq/questions.jsonl")
FAQ_TOP_N = int(os.environ.get("MOFID_FAQ_TOP_N", 20))
TEACHER_DB_PATH = os.environ.get("MOFID_TEACHER_DB_PATH", "./work/teacher.sqlite3")

REFUSAL_MESSAGE = "يا بيه السؤال دا مش موجود في المنهج الحالي. من فضلك اسأل معلمك."

SYSTEM_PROMPT_TEMPLATE = (
    "أنت مفيد، مساعد تعليمي ذكي. أجب على سؤال الطالب معتمدًا فقط على المحتوى المرجعي "
    "المقدم أدناه. لا تستخدم أي معلومات خارج هذا المحتوى. أجب بإيجاز ووضوح باللغة العربية.\n"
    f"إذا كان المحتوى المرجعي لا يحتوي على إجابة واضحة لسؤال الطالب، فيجب عليك الرد حصراً بهذه الجملة فقط دون أي شرح إضافي أو ذكر لما يحتويه النص المرجعي:\n\"{REFUSAL_MESSAGE}\"\n\n"
    "المحتوى المرجعي:\n{context}"
)

