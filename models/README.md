# Local Models

This directory contains local ML models for offline/edge inference.

## Structure

```
models/
├── embeddings/          # Embedding models for local RAG
│   └── all-MiniLM-L6-v2/  # Default embedding model
├── text-generation/     # Text generation models (optional)
└── README.md
```

## Embedding Models

For local RAG functionality, place compatible ONNX embedding models here.

### Recommended: all-MiniLM-L6-v2

Download from HuggingFace:

```bash
# Using huggingface-cli
pip install huggingface_hub
huggingface-cli download Xenova/all-MiniLM-L6-v2 --local-dir models/embeddings/all-MiniLM-L6-v2
```

Or manually download the ONNX files from:
https://huggingface.co/Xenova/all-MiniLM-L6-v2

### Model Requirements

- Format: ONNX (preferred) or TensorFlow.js
- Dimensions: 384 (for all-MiniLM-L6-v2)
- Memory: ~80MB for inference

## Usage

The local embeddings service will automatically detect and use models in this directory.
See `src/services/local-embeddings.service.ts` for implementation details.
