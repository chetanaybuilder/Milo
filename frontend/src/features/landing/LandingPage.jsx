import { useEffect, useRef, useState } from 'react';

/* ─── Scroll-reveal hook (IntersectionObserver) ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── Section wrapper with reveal animation ─── */
function Section({ id, className = '', children }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <section id={id} ref={ref} className={`lp-section ${className} ${visible ? 'lp-visible' : ''}`}>
      {children}
    </section>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, delay }) {
  const [ref, vis] = useReveal(0.18);
  return (
    <div
      ref={ref}
      className={`feat-card ${vis ? 'lp-visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="feat-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

/* ─── Step card ─── */
function StepCard({ num, title, desc, delay }) {
  const [ref, vis] = useReveal(0.18);
  return (
    <div
      ref={ref}
      className={`step-card ${vis ? 'lp-visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="step-num">{num}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

/* ─── Tech pill ─── */
function TechPill({ icon, label, delay }) {
  const [ref, vis] = useReveal(0.2);
  return (
    <div
      ref={ref}
      className={`tech-pill ${vis ? 'lp-visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="tech-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage({ onLaunch }) {
  const heroRef = useRef(null);

  /* Parallax on the hero floating elements */
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (heroRef.current) {
          const y = window.scrollY;
          const els = heroRef.current.querySelectorAll('.hero-float');
          els.forEach((el, i) => {
            const speed = 0.04 + i * 0.02;
            el.style.transform = `translateY(${y * speed}px)`;
          });
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="landing" role="main">
      {/* ─── Ambient background ─── */}
      <div className="lp-bg" aria-hidden="true">
        <div className="lp-glow lp-glow-1" />
        <div className="lp-glow lp-glow-2" />
        <div className="lp-glow lp-glow-3" />
        <div className="lp-stars" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="lp-nav" aria-label="Landing navigation">
        <span className="lp-brand">MILO</span>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#tech-stack">Tech</a>
          <a
            href="https://github.com/chetanaybuilder/Milo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="lp-hero" ref={heroRef}>
        {/* Floating decoration rings */}
        <div className="hero-float hero-ring hero-ring-1" aria-hidden="true" />
        <div className="hero-float hero-ring hero-ring-2" aria-hidden="true" />
        <div className="hero-float hero-ring hero-ring-3" aria-hidden="true" />

        {/* Orb glow */}
        <div className="hero-orb-wrap" aria-hidden="true">
          <div className="hero-orb" />
          <div className="hero-orb-pulse" />
        </div>

        <div className="hero-content">
          <p className="hero-badge">⚡ Powered by Groq &amp; Llama 3</p>
          <h1>
            Meet <span className="hero-accent">MILO</span>
            <br />
            <span className="hero-sub">Your Voice-First AI Assistant</span>
          </h1>
          <p className="hero-desc">
            Blazing-fast conversations with ultra-low latency. Speak naturally, search the web,
            check weather — all hands-free with a stunning 3D interface.
          </p>
          <div className="hero-actions">
            <button className="lp-cta" onClick={onLaunch}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Launch MILO
            </button>
            <a
              href="https://github.com/chetanaybuilder/Milo"
              target="_blank"
              rel="noopener noreferrer"
              className="lp-cta-secondary"
            >
              View on GitHub
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M7 17L17 7M17 7H7M17 7v10" />
              </svg>
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="hero-scroll" aria-hidden="true">
          <span>Scroll to explore</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <Section id="features" className="lp-features">
        <h2 className="lp-heading">
          <span className="lp-heading-accent">Features</span> that set MILO apart
        </h2>
        <p className="lp-subheading">Built for speed, designed for delight.</p>
        <div className="feat-grid">
          <FeatureCard
            delay={0}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            }
            title="Voice-First Interaction"
            desc="Real-time speech recognition and natural text-to-speech. Just talk — MILO listens, understands, and responds naturally."
          />
          <FeatureCard
            delay={100}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            }
            title="Ultra-Low Latency"
            desc="Powered by Groq's lightning-fast inference engine. Responses stream in real-time — feel the difference of sub-second AI."
          />
          <FeatureCard
            delay={200}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            }
            title="Web Search"
            desc="Real-time internet knowledge via Tavily integration. Ask about anything current — news, facts, trending topics."
          />
          <FeatureCard
            delay={300}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            }
            title="Live Weather"
            desc="Beautiful weather cards with real-time data from Open-Meteo. Ask for any city and get a gorgeous visual summary."
          />
          <FeatureCard
            delay={400}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            }
            title="Dynamic 3D Orb"
            desc="An interactive Three.js orb that reacts to MILO's state — breathing, pulsing, and shifting colors in real-time."
          />
          <FeatureCard
            delay={500}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            title="Secure by Design"
            desc="API keys never leave the backend. Rate-limiting, CORS, payload guards, and strict security headers protect every request."
          />
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <Section id="how-it-works" className="lp-how">
        <h2 className="lp-heading">
          How <span className="lp-heading-accent">MILO</span> works
        </h2>
        <p className="lp-subheading">Three simple steps, zero friction.</p>
        <div className="steps-grid">
          <StepCard
            delay={0}
            num="01"
            title="Speak or Type"
            desc="Tap Go Live and just start talking. MILO uses browser SpeechRecognition to transcribe your words in real-time. Or type if you prefer."
          />
          <StepCard
            delay={150}
            num="02"
            title="AI Thinks"
            desc="Your message streams to a Cloudflare Worker backend. MILO classifies intent, runs tools (search/weather), and streams Groq LLM tokens back instantly."
          />
          <StepCard
            delay={300}
            num="03"
            title="Hear & See"
            desc="Tokens stream into the UI and spoken aloud as natural sentences. The 3D orb pulses with each word. Sources and weather cards appear inline."
          />
        </div>
      </Section>

      {/* ─── DEMO / SCREENSHOTS ─── */}
      <Section id="demo" className="lp-demo">
        <h2 className="lp-heading">
          See <span className="lp-heading-accent">MILO</span> in action
        </h2>
        <p className="lp-subheading">A glimpse of the voice AI experience.</p>
        <div className="demo-gallery">
          <div className="demo-card">
            <div className="demo-img-wrap">
              <img
                src="/images/demo-idle.jpg"
                alt="MILO idle state — the glowing blue orb awaits your command"
                loading="lazy"
              />
            </div>
            <div className="demo-label">
              <span className="demo-dot demo-dot-blue" />
              Idle — Ready to assist
            </div>
          </div>
          <div className="demo-card">
            <div className="demo-img-wrap">
              <img
                src="/images/demo-listening.jpg"
                alt="MILO listening state — the orb turns green and pulses while transcribing speech"
                loading="lazy"
              />
            </div>
            <div className="demo-label">
              <span className="demo-dot demo-dot-green" />
              Listening — Voice active
            </div>
          </div>
        </div>
      </Section>

      {/* ─── TECH STACK ─── */}
      <Section id="tech-stack" className="lp-tech">
        <h2 className="lp-heading">
          <span className="lp-heading-accent">Tech Stack</span>
        </h2>
        <p className="lp-subheading">Modern, fast, edge-first architecture.</p>
        <div className="tech-grid">
          <TechPill delay={0} icon="⚛️" label="React + Vite" />
          <TechPill delay={60} icon="🎨" label="Three.js" />
          <TechPill delay={120} icon="☁️" label="Cloudflare Workers" />
          <TechPill delay={180} icon="📄" label="Cloudflare Pages" />
          <TechPill delay={240} icon="🧠" label="Groq (Llama 3)" />
          <TechPill delay={300} icon="🔍" label="Tavily Search" />
          <TechPill delay={360} icon="🌤️" label="Open-Meteo" />
          <TechPill delay={420} icon="🎙️" label="Web Speech API" />
        </div>
      </Section>

      {/* ─── Final CTA ─── */}
      <Section id="cta" className="lp-final-cta">
        <div className="cta-glow" aria-hidden="true" />
        <h2>Ready to experience the future of voice AI?</h2>
        <p>No sign-up required. Just click and start talking.</p>
        <button className="lp-cta lp-cta-big" onClick={onLaunch}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          Launch MILO Now
        </button>
      </Section>

      {/* ─── Footer ─── */}
      <footer className="lp-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="lp-brand">MILO</span>
            <p className="footer-tagline">
              Voice-first AI assistant — blazing fast, beautifully interactive.
            </p>
          </div>

          <div className="footer-links">
            <div className="footer-col">
              <h4>Navigate</h4>
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#tech-stack">Tech Stack</a>
              <a href="#demo">Demo</a>
            </div>
            <div className="footer-col">
              <h4>Project</h4>
              <a
                href="https://github.com/chetanaybuilder/Milo"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://github.com/chetanaybuilder/Milo/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contributing
              </a>
              <a
                href="https://github.com/chetanaybuilder/Milo/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                MIT License
              </a>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <a href="https://groq.com" target="_blank" rel="noopener noreferrer">
                Groq
              </a>
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
                Tavily
              </a>
              <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
                Open-Meteo
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-security">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            All API keys are stored server-side only. No user data is collected or stored.
          </p>
          <p className="footer-copy">
            &copy; {new Date().getFullYear()} MILO by Chetanay Batra. Open-source under MIT.
          </p>
        </div>
      </footer>
    </div>
  );
}
