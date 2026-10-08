# Architecture of MILO

MILO uses a distributed architecture with a FastAPI backend and a React (Vite) frontend.

## Components

### 1. Frontend (React + Three.js)
- **MiloCore**: 3D visualization using `@react-three/fiber` to display the orb.
- **VoiceController**: Handles STT (Speech-to-Text), TTS (Text-to-Speech), and microphone access.
- **ChatInterface**: Displays the chat log, sources, and weather data.

### 2. Backend (FastAPI)
- **Controller**: Manages incoming requests, builds prompts, and streams NDJSON responses.
- **Router**: Simple regex-based classifier to route queries (Web Search, Weather, or Chat).
- **AI Provider**: Integrates with Groq to stream LLM responses.
- **Tools**:
  - `web_search`: Uses Tavily API to fetch current web results.
  - `weather`: Uses Open-Meteo API for geolocation and weather forecasts.

## Data Flow
1. User speaks or types a message.
2. Frontend sends an HTTP POST stream request to `/api/chat`.
3. Backend classifies the intent. If it's a tool request, it fetches external data.
4. Backend streams NDJSON chunks (`tool`, `sources`, `weather`, `token`, `error`, `done`) back to the frontend.
5. Frontend consumes the stream, updates the UI, and synthesizes speech concurrently as tokens arrive.
