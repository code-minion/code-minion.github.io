# Bradley Chan // Cyberpunk Portfolio & CV System

A high-performance, 3D interactive portfolio and professional curriculum vitae (CV) system.

## 🌌 Overview

This project serves as a comprehensive digital identity, featuring:
- **3D Terminal Interface**: An immersive Three.js environment with high-fidelity model interaction and real-time lighting.
- **AI Career Assistant**: A custom-trained agent capable of answering queries about my technical background and forwarding messages to me securely.
- **Data-Driven CV**: A dedicated, optimized CV page that pulls from a central JSON schema for high-precision content management.

## 🛠️ Tech Stack

- **Graphics**: [Three.js](https://threejs.org/) (WebGL), GSAP
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: Modern Vanilla CSS (Custom tokens, Glassmorphism)
- **Model Compression**: [Meshopt](https://github.com/zeux/meshoptimizer) (optimized via glTF-Transform)
- **Deployment**: [GitHub Pages](https://pages.github.com/)

## 🏗️ System Architecture

The portfolio is architected holistically across two primary domains:

1.  **Frontend (This Repository)**:
    - Serves purely static assets for maximum performance and security.
    - Integrates with Cloudflare Turnstile for bot protection during interactive segments.
    - Implements a Singleton Loader pattern for 3D assets to minimize memory overhead.

2.  **Backend (Decoupled LLM-BFF)**:
    - A serverless Proxy (LLM-BFF) handles all sensitive LLM operations and notification forwarding.
    - **Security**: All API keys and notification webhooks are managed securely on the backend; no sensitive identifiers are exposed in this public repository.
    - **Interconnect**: Communication is established via authenticated POST requests with IP-based rate limiting.

## 🚀 Key Optimizations

- **Assets**: 3D character model compressed from 7MB to 1.99MB using high-fidelity Meshopt pipelines (preserving triangle count while optimizing vertex precision).
- **Execution**: Throttled raycasting and animation updates (20-30 FPS) to ensure smooth performance across mobile and desktop devices.
- **Hydration**: Data-driven content injection ensures the CV is always up-to-date with minimal code changes.

---
*Last updated: 2026-04-09*
