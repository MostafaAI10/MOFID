"""
Load content/physics_grade12.json (or MOFID_CONTENT_PATH) and index it into
Chroma. Run this once after the Chroma server (scripts/start_chroma.sh) is up,
and again any time the curriculum content file changes.

    python -m backend.index_content
"""

import json

from backend import config
from backend.rag import index_chunks


def main():
    with open(config.CONTENT_PATH, encoding="utf-8") as f:
        chunks = json.load(f)

    total = index_chunks(chunks)
    print(f"Indexed {len(chunks)} chunks from {config.CONTENT_PATH}")
    print(f"Total chunks now in collection: {total}")


if __name__ == "__main__":
    main()
