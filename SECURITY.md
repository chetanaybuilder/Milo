# Security Policy — MILO Voice Assistant

## Overview
MILO is designed with defense-in-depth principles across its full stack: a static React client hosted on Cloudflare Pages, an edge API gateway on Cloudflare Workers, Groq Llama 3 LLM inference, and external tool integrations (Tavily Search, Open-Meteo Weather).

This document outlines our security architecture, defensive controls, vulnerability disclosure process, and an honest assessment of residual risks.

---

## Reporting a Vulnerability

We take the security of MILO seriously. If you discover a security vulnerability, please report it responsibly:

- **Email**: `security@milo-assistant.dev` (or open a confidential GitHub Security Advisory)
- **Response SLA**: We acknowledge receipt of vulnerability reports within 48 hours and provide remediation timelines within 5 business days.
- **Responsible Disclosure**: Please allow reasonable time for a fix to be published before disclosing any details publicly. Do not access, modify, or exfiltrate private user data during testing.

---

## Defensive Controls Implemented

### 1. Server-Side Secret Management
- **Zero Client-Side Secrets**: All third-party API keys (`GROQ_API_KEY`, `TAVILY_API_KEY`) are managed exclusively server-side as Cloudflare Worker encrypted secrets (`wrangler secret put`).
- **Client Bundles**: The frontend bundle contains zero secrets, referencing only the public API base URL (`VITE_API_BASE_URL`).
- **Token Redaction**: Automatic regex-based redaction prevents sensitive keys (`gsk_*`, `tvly-*`, `Bearer *`) from appearing in server-side log streams.

### 2. Strict CORS Policy
- **No Wildcard Domains**: The API gateway rejects wildcard cross-origin access and disallows arbitrary subdomains (`*.pages.dev`).
- **Explicit Allowlist**: Only explicitly configured origins in `CORS_ORIGINS` (along with localized development origins like `http://localhost:5173`) are permitted.
- **Preflight Caching**: Successful preflight requests are cached securely with `maxAge: 86400`.

### 3. Rate Limiting & DoS Protection
- **Token Bucket per IP**: Enforces a capacity of 30 requests with a refill rate of 0.5 tokens/sec (30 requests/minute sustained).
- **Memory-Pruning Guard**: The in-memory tracking map is capped at 5,000 IPs with periodic TTL sweeps (10-minute expiry) to prevent isolate memory exhaustion.
- **Payload Caps**: Strict 64 KB content-length limit on incoming chat requests. Payloads exceeding this limit receive HTTP 413.

### 4. Input Validation & Schema Sanitization
- **Message Validation**: Messages must be non-empty strings between 1 and 2,000 characters with ASCII control characters stripped.
- **History Validation**: History arrays are capped to 10 items. Roles are strictly whitelisted to `'user'` and `'assistant'` (preventing injected `'system'` roles), and each item is constrained to 1,200 characters.

### 5. Prompt-Injection Defenses for Tool Results
- **XML Tag Encapsulation**: Untrusted search results are strictly wrapped inside `<untrusted_search_results>` and individual `<result>` blocks.
- **Pattern Disarming**: Common injection phrases (`ignore previous instructions`, `system override`, markdown image exfiltration) are sanitized before entering the prompt.
- **System Directives**: The LLM system prompt explicitly instructs the model to treat search findings purely as passive factual data and ignore any instructions embedded in web content.

### 6. Output Sanitization & XSS Defense
- **Strict Protocol Validation**: Links in research source cards are validated before rendering; only `https://` and `http://` protocols are allowed. Unsafe schemes (`javascript:`, `data:`, `vbscript:`) are blocked.
- **React Auto-Escaping**: Chat text is rendered via React JSX expressions, preventing direct DOM injection of arbitrary HTML tags.
- **External Links**: All outbound links use `rel="noopener noreferrer"` to prevent tab-nabbing.

### 7. HTTP Security Headers
Both Cloudflare Pages static hosting (`_headers`) and Cloudflare Workers API responses enforce:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy`: Restricts scripts, styles, fonts, and connections to trusted origins.
- `X-Frame-Options: DENY`: Prevents clickjacking in iframes.
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`: Minimizes referrer leakage.
- `Permissions-Policy`: Restricts camera, microphone (to self only on client), geolocation, payments, and USB.

---

## Honest Assessment of Residual Risks

No software system is unhackable. In the spirit of defense-in-depth, we document known residual risks and operational considerations:

1. **Indirect Prompt Injection in LLMs**:
   - *Risk*: Because LLMs process instructions and external data in the same context window, sophisticated adversarial content hosted on indexed third-party websites could attempt to bias or steer the assistant's tone or answer.
   - *Mitigation*: We isolate external results in XML containers and instruct the model to reject commands. However, prompt injection remains an evolving challenge across the entire AI industry.

2. **Edge Isolate Rate Limiting**:
   - *Risk*: The in-memory token bucket operates per Cloudflare Worker isolate. A coordinated, highly distributed botnet hitting diverse global edge points could exceed local thresholds before global rate limits engage.
   - *Recommendation*: For high-scale enterprise deployments, enable Cloudflare WAF / Zone Rate Limiting Rules or integrate Cloudflare KV/Durable Objects for global counter synchronization.

3. **Client-Side Speech API Dependency**:
   - *Risk*: The assistant uses browser-native SpeechRecognition and SpeechSynthesis. Audio session handling and microphone privacy prompts depend entirely on the host browser and operating system.
   - *Mitigation*: We gracefully detect mobile and desktop environments, provide text fallbacks, and handle denied microphone permissions transparently.

4. **Development Toolchain vs. Production Surface**:
   - *Risk*: `npm audit` flags dev-time dependencies (such as Vite/esbuild local dev server advisory GHSA-67mh-4wv8-2f99) used during development.
   - *Context*: These packages are not bundled into production static assets or the Cloudflare Worker runtime bundle.
