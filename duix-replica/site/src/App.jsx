import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const useCases = [
  {
    name: "AI doctor",
    image: "/assets/doctor.webp",
    description:
      "Accessible, compassionate, and always on call — your AI doctor offers 24/7 health advice and virtual consultations.",
  },
  {
    name: "AI customer service",
    image: "/assets/customer-service.webp",
    description:
      "Transform how your business supports customers with faster, more personal conversations at any hour.",
  },
  {
    name: "AI interview",
    image: "/assets/interview.webp",
    description:
      "Real-time interviews. Instant analysis. Smarter hiring, anywhere.",
  },
  {
    name: "AI girlfriend",
    image: "/assets/girlfriend.webp",
    description:
      "She listens, cares, and remembers — an AI companion built for natural, thoughtful conversation.",
  },
  {
    name: "AI boyfriend",
    image: "/assets/boyfriend.webp",
    description:
      "Share thoughts, laughter, and comfort with an AI companion designed for emotional presence.",
  },
  {
    name: "School AI",
    image: "/assets/school.webp",
    description:
      "Support educators and captivate students with an AI assistant that brings interactive lessons to life.",
  },
];

const capabilities = [
  ["Vision", "Understand images and the world around your users."],
  ["Memory", "Carry context forward for personal, continuous conversations."],
  ["Knowledge", "Connect private documents and business data securely."],
  ["Emotion", "Respond with expressive voice, timing, and natural presence."],
];

function ArrowIcon({ direction = "right" }) {
  const rotation = { right: 0, up: -90, left: 180 }[direction] ?? 0;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5h11v11M19 5 5 19" />
    </svg>
  );
}

function Header({ menuOpen, setMenuOpen }) {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="logo-link" href="#top" aria-label="Duix home">
          <img src="/assets/logo.svg" alt="Duix" />
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="https://docs.duix.com/documentation/introduction" target="_blank" rel="noreferrer">
            Docs <ExternalIcon />
          </a>
          <a href="#capabilities">Capabilities</a>
          <a href="#developer">Developer</a>
          <a href="#about">About</a>
        </nav>
        <div className="nav-actions">
          <a className="button button-small button-outline desktop-action" href="https://github.com/duixcom" target="_blank" rel="noreferrer">
            Open source <ExternalIcon />
          </a>
          <a className="button button-small desktop-action" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">
            Join in
          </a>
          <button
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <div id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <a href="#use-cases" onClick={() => setMenuOpen(false)}>Use cases</a>
        <a href="#capabilities" onClick={() => setMenuOpen(false)}>Capabilities</a>
        <a href="#developer" onClick={() => setMenuOpen(false)}>Developer</a>
        <a href="https://docs.duix.com/documentation/introduction" target="_blank" rel="noreferrer">Docs <ExternalIcon /></a>
        <a className="button" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">Join in</a>
      </div>
    </header>
  );
}

function App() {
  const root = useRef(null);
  const video = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCase, setActiveCase] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    const context = gsap.context(() => {
      gsap.from(".hero-copy > *", {
        y: 36,
        opacity: 0,
        duration: 0.72,
        stagger: 0.08,
        ease: "power3.out",
      });
      gsap.utils.toArray(".reveal").forEach((element) => {
        gsap.from(element, {
          y: 50,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 84%", once: true },
        });
      });
      gsap.to(".business-image img", {
        scale: 1.12,
        yPercent: -8,
        ease: "none",
        scrollTrigger: {
          trigger: ".business-story",
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, root);
    return () => context.revert();
  }, []);

  const toggleVideo = () => {
    if (!video.current) return;
    if (video.current.paused) {
      video.current.play();
      setIsPlaying(true);
    } else {
      video.current.pause();
      setIsPlaying(false);
    }
  };

  const copyCode = async () => {
    const code = `import { Duix } from "@duix/sdk";\n\nconst avatar = await Duix.connect({\n  avatarId: "your-avatar-id",\n  language: "en-US"\n});\n\navatar.speak("Welcome. How can I help?");`;
    const legacyCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const succeeded = document.execCommand("copy");
      textarea.remove();
      if (!succeeded) throw new Error("Copy command was rejected");
    };
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          legacyCopy();
        }
      } else {
        legacyCopy();
      }
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 2200);
    }
  };

  return (
    <div ref={root} id="top">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main>
        <section className="hero section-shell">
          <div className="hero-copy">
            <div className="headshots-mobile"><img src="/assets/headshots.png" alt="" /></div>
            <h1>
              #1 Conversational AI
              <br />
              with real face and voice
              <img className="headshots-inline" src="/assets/headshots.png" alt="" />
            </h1>
            <p>
              Customize appearance and voice, support multiple languages, seamlessly integrate with knowledge bases, and significantly boost your business revenue.
            </p>
            <div className="hero-actions">
              <a className="button button-large" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">
                Start for free
              </a>
              <a className="button button-large button-outline" href="mailto:support@duix.com">
                Contact sales
              </a>
            </div>
            <small>No payment required</small>
          </div>
          <div className="hero-media">
            <video ref={video} src="/assets/hero.mp4" autoPlay muted loop playsInline preload="metadata" />
            <button className="video-control" onClick={toggleVideo} aria-label={isPlaying ? "Pause hero video" : "Play hero video"}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <a className="button button-large talk-button" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">
              Start talk for free
            </a>
          </div>
        </section>

        <section id="use-cases" className="use-cases section-shell section-space reveal">
          <div className="section-heading">
            <h2>Conversational AI for every role in your business</h2>
            <p>One platform, countless roles — conversational AI agents can work, teach, guide, and care.</p>
          </div>
          <div className="case-layout">
            <div className="case-tabs" role="tablist" aria-label="AI use cases">
              {useCases.map((item, index) => (
                <button
                  key={item.name}
                  role="tab"
                  aria-selected={activeCase === index}
                  className={activeCase === index ? "active" : ""}
                  onClick={() => setActiveCase(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.name}
                </button>
              ))}
            </div>
            <div className="case-stage" role="tabpanel">
              <img key={useCases[activeCase].image} src={useCases[activeCase].image} alt={`${useCases[activeCase].name} avatar`} />
              <div className="case-caption">
                <h3>{useCases[activeCase].name}</h3>
                <p>{useCases[activeCase].description}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="business-story section-space">
          <div className="business-copy reveal">
            <p className="eyebrow">Available 24/7</p>
            <h2>Scale your business with visual AI agent</h2>
            <p className="big-line">Real expressions<br />Real voice<br />Real connection</p>
            <p>
              200ms TTFB latency, expressive voice, and true-to-life avatars deliver real-time two-way interactions that can improve engagement and service quality.
            </p>
            <a className="button button-light button-large" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">
              Create your AI avatar
            </a>
          </div>
          <div className="business-image">
            <img src="/assets/business.webp" alt="Duix visual AI agent" />
          </div>
        </section>

        <section id="about" className="trust section-shell section-space reveal">
          <div className="section-heading left">
            <p className="eyebrow">Built for real teams</p>
            <h2>Human presence, without the operational limits</h2>
          </div>
          <div className="trust-grid">
            <article><strong>24/7</strong><h3>Full accessibility support</h3><p>Offer a consistent, face-to-face experience across time zones and devices.</p></article>
            <article><strong>1:1</strong><h3>White-label customization</h3><p>Match appearance, voice, knowledge, and personality to your brand.</p></article>
            <article><strong>50+</strong><h3>Languages supported</h3><p>Serve multilingual audiences with natural voice and localized content.</p></article>
          </div>
        </section>

        <section id="developer" className="developer section-space">
          <div className="developer-inner section-shell">
            <div className="developer-copy reveal">
              <p className="eyebrow">Developer</p>
              <h2>Seamlessly integrate with our API</h2>
              <p>Connect your product to real-time interactive digital humans with a focused API and platform SDKs.</p>
              <a className="text-link" href="https://docs.duix.com/documentation/introduction" target="_blank" rel="noreferrer">
                Read the documentation <ArrowIcon />
              </a>
            </div>
            <div className="code-window reveal">
              <div className="code-header">
                <span>Quick start</span>
                <button onClick={copyCode}>{copied ? "Copied" : copyFailed ? "Select code to copy" : "Copy code"}</button>
              </div>
              <pre><code><span>import</span> {"{ Duix }"} <span>from</span> <i>"@duix/sdk"</i>;{"\n\n"}<span>const</span> avatar = <span>await</span> Duix.connect({`{\n  `}avatarId: <i>"your-avatar-id"</i>,{`\n  `}language: <i>"en-US"</i>{`\n}`});{"\n\n"}avatar.speak(<i>"Welcome. How can I help?"</i>);</code></pre>
            </div>
          </div>
        </section>

        <section id="capabilities" className="capabilities section-shell section-space reveal">
          <div className="section-heading left">
            <p className="eyebrow">Advanced capabilities</p>
            <h2>More than a chatbot</h2>
            <p>Duix avatars can understand context, reflect emotion, and bring knowledge to a natural face-to-face experience.</p>
          </div>
          <div className="capability-list">
            {capabilities.map(([title, description], index) => (
              <article key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta section-shell reveal">
          <div>
            <h2>Make every conversation feel present.</h2>
            <p>Build an AI avatar with a face, a voice, and knowledge that is uniquely yours.</p>
          </div>
          <a className="button button-large button-light" href="https://www.duix.com/login?redirect=/dashboard" target="_blank" rel="noreferrer">
            Start for free <ArrowIcon />
          </a>
        </section>
      </main>

      <footer>
        <div className="footer-grid section-shell">
          <a className="footer-logo" href="#top" aria-label="Back to top"><img src="/assets/logo.svg" alt="Duix" /></a>
          <div><h3>Interactive AI avatar</h3>{useCases.map((item) => <a key={item.name} href="#use-cases">{item.name}</a>)}</div>
          <div><h3>Legal &amp; support</h3><a href="https://www.duix.com/privacy-policy" target="_blank" rel="noreferrer">Privacy policy</a><a href="https://www.duix.com/terms-of-service" target="_blank" rel="noreferrer">Terms of service</a><a href="https://github.com/duixcom" target="_blank" rel="noreferrer">GitHub</a></div>
          <div><h3>Contact us</h3><a href="mailto:support@duix.com">support@duix.com</a><p>Built with DUIX.COM</p></div>
          <p className="copyright">© 2026 DUIX. All rights reserved.</p>
          <a className="back-top" href="#top" aria-label="Back to top"><ArrowIcon direction="up" /></a>
        </div>
      </footer>
    </div>
  );
}

export default App;
