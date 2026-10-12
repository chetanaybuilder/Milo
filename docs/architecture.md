# Architecture of MILO

MILO uses a distributed, feature-modular architecture with a Cloudflare Worker backend and a React (Vite) frontend deployed on Cloudflare Pages.

## Directory Structure & Code Organization

The repository is organized with clear separation of concerns, centralized configuration, and feature-driven domains:

```text
d:\milo\
├── backend-worker/                # Production Cloudflare Worker (Hono edge API)
│   ├── src/
│   │   ├── ai/
│   │   │   └── groq.js            # Groq streaming client, exponential backoff & model fallbacks
│   │   ├── assistant/
│   │   │   ├── controller.js      # Streaming orchestrator & response lifecycle
│   │   │   ├── prompts.js         # Spoken-style system prompts & XML injection defenses
│   │   │   └── router.js          # Fast intent regex classifier (Weather, Search, Chat)
│   │   ├── tools/
│   │   │   ├── weather.js         # Open-Meteo weather geolocation and forecasting
│   │   │   └── webSearch.js       # Tavily web search with domain & image extraction
│   │   ├── config.js              # Centralized backend worker configuration & CORS allowlist
│   │   └── index.js               # Hono app, rate limiter, security headers & routing
│   ├── .dev.vars.example          # Safe development environment template
│   ├── package.json
│   └── wrangler.toml              # Cloudflare Worker deployment definition
│
├── frontend/                      # Production React + Vite Client (Cloudflare Pages)
│   ├── public/
│   │   ├── _headers               # Production security headers (CSP, HSTS, Permissions-Policy)
│   │   └── images/                # Static visual assets
│   ├── src/
│   │   ├── config/                # Centralized frontend configuration
│   │   │   ├── constants.js       # API endpoints, timing, voice parameters & input limits
│   │   │   └── index.js           # Re-exports configuration
│   │   ├── features/              # Domain-driven feature modules
│   │   │   ├── chat/              # Chat conversation UI
│   │   │   │   ├── ChatInterface.jsx  # 3D dock, suggestion chips, input field & streaming
│   │   │   │   ├── Sources.jsx        # Rich citation cards with favicons & thumbnails
│   │   │   │   ├── WeatherCard.jsx    # Real-time meteorological summary card
│   │   │   │   └── index.js
│   │   │   ├── landing/           # High-aesthetic landing page
│   │   │   │   ├── LandingPage.jsx    # 3D interactive hero, feature showcase & footer
│   │   │   │   └── index.js
│   │   │   ├── settings/          # Voice personalization drawer
│   │   │   │   ├── SettingsDrawer.jsx # Voice selector, rate/pitch sliders & voice preview
│   │   │   │   └── index.js
│   │   │   └── voice/             # Speech recognition & synthesis subsystem
│   │   │       ├── audio/
│   │   │       │   └── levelMeter.js  # AudioContext microphone volume analyzer
│   │   │       ├── stt/
│   │   │       │   ├── base.js        # Base speech recognition interface
│   │   │       │   └── browserStt.js  # Web Speech API wrapper with session sequencing & iOS Safari handling
│   │   │       ├── tts/
│   │   │       │   ├── base.js        # Base speech synthesis interface
│   │   │       │   └── browserTts.js  # speechSynthesis wrapper with chunking & unlocking
│   │   │       ├── controller.js      # VoiceController state machine & acoustic echo isolation
│   │   │       ├── MiloCore.jsx       # Three.js / Canvas 3D audio-reactive orb visualizer
│   │   │       ├── VoiceInterface.jsx # Live mode toggle button and interim HUD
│   │   │       └── index.js
│   │   ├── components/            # Shared / reusable design system components
│   │   │   └── common/
│   │   │       ├── ToolStatus.jsx # Real-time state badge (Online, Thinking, Researching)
│   │   │       └── index.js
│   │   ├── hooks/                 # Custom React hooks
│   │   │   ├── useMilo.js         # Core conversation orchestrator & sentence buffering
│   │   │   ├── useReducedMotion.js# prefers-reduced-motion media query listener
│   │   │   └── index.js
│   │   ├── services/              # External communication services
│   │   │   ├── api.js             # NDJSON streaming HTTP client with retry & timeout
│   │   │   └── index.js
│   │   ├── styles/                # CSS design system stylesheets
│   │   │   ├── landing.css        # Landing page typography, keyframes & 3D styling
│   │   │   └── styles.css         # Assistant dock, 3D chat bubbles & responsive layout
│   │   ├── App.jsx                # Root view router (Landing vs Assistant)
│   │   └── main.jsx               # React DOM entry point
│   ├── eslint.config.js           # ESLint 9 configuration
│   ├── vite.config.js             # Vite build & proxy config
│   └── package.json
│
├── backend/                       # Reference Python FastAPI backend & test suite
│   ├── app/
│   │   ├── ai/
│   │   ├── assistant/
│   │   ├── tools/
│   │   ├── config.py              # Centralized Python backend configuration
│   │   ├── main.py
│   │   ├── models.py
│   │   └── security.py
│   ├── tests/
│   │   └── test_app.py            # Pytest test suite
│   ├── pytest.ini                 # Pytest configuration
│   └── requirements.txt
│
├── docs/                          # Architecture & design documentation
│   └── architecture.md
├── .gitignore                     # Git secret isolation rules
├── .prettierrc                    # Code formatting configuration
├── SECURITY.md                    # Security audit findings, threat model & disclosure policy
└── README.md                      # Primary project overview & getting started guide
```

## System Components

### 1. Frontend (`frontend/`)
- **Features (`src/features/`)**: Self-contained domain modules for Chat, Voice, Landing, and Settings.
- **MiloCore (`src/features/voice/MiloCore.jsx`)**: 3D interactive particle sphere and inner core using `@react-three/fiber` and Three.js with WebGL fallback.
- **Voice Subsystem (`src/features/voice/`)**: State machine (`VoiceController`) implementing session sequencing, acoustic echo cancellation, and seamless user barge-in interruptions.
- **Services (`src/services/api.js`)**: Robust NDJSON streaming client with timeout handling and automatic retry on transient gateway errors.
- **Centralized Config (`src/config/constants.js`)**: Single source of truth for endpoints, timeouts, buffer regexes, and hardware notices.

### 2. Backend Worker (`backend-worker/`)
- **Controller (`src/assistant/controller.js`)**: Manages incoming requests, formats spoken prompt instructions, and streams NDJSON responses.
- **Router (`src/assistant/router.js`)**: Fast regex intent classification directing queries to Web Search, Weather, or Direct LLM.
- **AI Provider (`src/ai/groq.js`)**: Streams LLM responses with exponential backoff with jitter and fallback to lightweight models (`llama-3.1-8b-instant`) under rate pressure.
- **Tools (`src/tools/`)**: Web search (Tavily) with sanitization and image extraction, and real-time meteorology (Open-Meteo).
- **Security (`src/index.js`, `src/config.js`)**: Token bucket per-IP rate limiting, strict CORS allowlist, prompt-injection isolation blocks, and security headers.

## Data Flow
```text
User Speech / Text
      │
      ▼
Frontend (Browser STT / ChatInput)
      │
      ▼  POST /api/chat (NDJSON stream request)
Cloudflare Worker (Hono edge router)
      │
      ├──> Intent Classifier (Router)
      │         ├──> Weather (Open-Meteo API)
      │         └──> Web Search (Tavily API with XML boundary tags)
      │
      ▼
Groq LLM (Streaming inference with fallback)
      │
      ▼  NDJSON Chunks ({type: 'token'|'weather'|'sources'|'tool'})
Frontend Stream Reader (api.js)
      │
      ├──> UI State Update (Chat bubbles, 3D cards, status HUD)
      └──> Sentence Buffer ──> Browser TTS (Speech synthesis)
```
