<div align="center">
  <img src="docs/media/demo.gif" alt="MILO Assistant" width="100%">
  
  <h1>MILO</h1>
  <p><b>A blazing-fast, voice-first AI assistant powered by Groq and Llama 3.</b></p>
  
  <p>
    <a href="https://github.com/chetanaybuilder/Milo/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
    <img src="https://img.shields.io/badge/python-3.11+-blue" alt="Python">
    <img src="https://img.shields.io/badge/node-18+-green" alt="Node">
  </p>
</div>

<hr/>

## Overview
MILO is a voice-native conversational AI assistant. It provides a seamless, hands-free experience with real-time text-to-speech, dynamic 3D visualizations, web search, and weather capabilities.

## Features
- 🎙️ **Voice-First Interaction**: Real-time STT and natural TTS with backchanneling.
- ⚡ **Ultra-Low Latency**: Powered by Groq's high-speed inference.
- 🌐 **Web Search**: Integrates Tavily for real-time internet knowledge.
- 🌤️ **Live Weather**: Powered by Open-Meteo.
- 🎨 **Dynamic 3D UI**: An interactive 3D orb that reacts to the assistant's state.

## Screenshots
<!-- Add placeholder screenshots here -->

## Architecture
MILO is split into a Cloudflare Worker backend (Hono) and a React/Three.js frontend (Cloudflare Pages). See the detailed architecture diagram in `docs/architecture.md`.

## Tech Stack
- **Backend**: JavaScript, Hono (Cloudflare Workers), Groq
- **Frontend**: React, Vite, Three.js (@react-three/fiber), Vanilla CSS
- **Deployment**: Cloudflare Pages (frontend), Cloudflare Workers (backend)

## Project Structure
```text
milo/
├── backend/          # Original Python backend (reference)
├── backend-worker/   # Cloudflare Worker backend (production)
└── frontend/         # React, Three.js UI, Voice controllers
```

## Prerequisites
- Node.js 18+
- Python 3.11+
- API keys from Groq and Tavily

## Quick Start

### Backend (Cloudflare Worker)
```bash
cd backend-worker
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys
npm run dev
```
The Worker dev server runs at `http://localhost:8787`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server runs at `http://localhost:5173` and proxies `/api` requests to the Worker.

## Deployment

MILO is deployed entirely on **Cloudflare** — frontend on Cloudflare Pages, backend on Cloudflare Workers.

### Frontend (Cloudflare Pages)
1. Connect your GitHub repository to [Cloudflare Pages](https://pages.cloudflare.com/).
2. Set the **Root Directory** to `frontend`.
3. Set the **Build Command** to `npm run build` and **Output Directory** to `dist`.
4. Add the environment variable `VITE_API_BASE_URL` pointing to your Worker URL (e.g., `https://milo-api.<your-subdomain>.workers.dev`).
5. Deploy.

### Backend (Cloudflare Workers)
1. Install dependencies:
   ```bash
   cd backend-worker
   npm install
   ```
2. Copy `.dev.vars.example` to `.dev.vars` and fill in your API keys for local development:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
3. **Local development:**
   ```bash
   npm run dev
   ```
   The Worker runs at `http://localhost:8787`.
4. **Set production secrets** (one-time):
   ```bash
   npx wrangler secret put GROQ_API_KEY
   npx wrangler secret put TAVILY_API_KEY
   npx wrangler secret put CORS_ORIGINS
   ```
5. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

## Configuration

| Variable | Required | Default | Purpose | Get it from |
| -------- | -------- | ------- | ------- | ----------- |
| `GROQ_API_KEY` | Yes | | API key for LLM inference | [Groq Console](https://console.groq.com/keys) |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | The model to use | - |
| `TAVILY_API_KEY` | Yes | | API key for web search | [Tavily](https://app.tavily.com/home) |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Allowed CORS origins | - |

## How Voice Works
The frontend uses the Web Speech API (`SpeechRecognition` and `SpeechSynthesis`) for STT and TTS. The backend streams tokens, and the frontend buffers them into complete sentences before speaking them, ensuring natural prosody and low latency.

## How Tools Work
MILO uses a fast regex-based router to detect intents (Weather or Web Search) before hitting the LLM. 
- **Web Search**: Queries Tavily, extracts snippets, and injects them into the LLM prompt.
- **Weather**: Queries Open-Meteo based on the requested location, generating a real-time weather card.

## Security Model
- API keys are strictly confined to the backend and never logged.
- The health endpoint exposes only generic status.
- Strict CORS, payload limits, rate-limiting, and security headers are enforced.
- Web search results are treated as untrusted data to mitigate prompt injection.
- No secrets are used or stored in the frontend.

## Browser Support
For the best voice experience, use **Microsoft Edge** on Windows, or Google Chrome. Safari is supported but may have limited voice options.

## Troubleshooting
- **No Voice Output**: Ensure your browser supports `speechSynthesis` and permissions are granted.
- **API Errors**: Check the backend console. Ensure your `GROQ_API_KEY` and `TAVILY_API_KEY` are valid and have sufficient quota.

## Testing
To run original backend tests (Python, reference only):
```bash
cd backend
PYTHONPATH=. pytest
```
To build and preview the frontend:
```bash
cd frontend
npm run build
npm run preview
```
To run the Worker backend locally:
```bash
cd backend-worker
npm run dev
```

## Roadmap
- Multi-language voice support
- Custom wake words
- Additional tool integrations

## Contributing
Please see `CONTRIBUTING.md` for details.

## License
This project is licensed under the MIT License - see the `LICENSE` file for details.

## Acknowledgements
- [Groq](https://groq.com) for the blazing-fast LLM API.
- [Tavily](https://tavily.com) for search.
- [Open-Meteo](https://open-meteo.com) for open weather data.

Author: Chetanay Batra
See [LICENSE](LICENSE) for open-source notice.
