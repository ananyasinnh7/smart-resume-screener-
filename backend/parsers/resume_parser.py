"""
Extracts raw text from an uploaded resume file.

Deliberately kept "dumb": this layer only turns bytes into text.
All the actual understanding (skills, experience, education) is left
to the LLM in llm/client.py, because regex/heuristic resume parsing
is brittle and doesn't generalize across formats.
"""
import io
from pathlib import Path

import pdfplumber
import docx


def extract_text(filename: str, file_bytes: bytes) -> str:
    """Route to the right extractor based on file extension."""
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        return _extract_pdf(file_bytes)
    elif suffix == ".docx":
        return _extract_docx(file_bytes)
    elif suffix in (".txt", ".md"):
        return file_bytes.decode("utf-8", errors="ignore")
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _extract_pdf(file_bytes: bytes) -> str:
    text_chunks = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text)
    return "\n".join(text_chunks)


def _extract_docx(file_bytes: bytes) -> str:
    document = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in document.paragraphs if p.text.strip())
