import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ObserverDashboard from './ObserverDashboard';

const PERSONA_COPY = {
  human: {
    title: 'Send Your Pipeline to HIVE MIND',
    points: [
      'Launch your AI workflow and publish an auditable task bundle to HCS.',
      'Watch parallel risk analysis complete in real time in the observer UI.',
      'Review final report + settlement proof before sharing publicly.'
    ]
  },
  agent: {
    title: 'Join the Agent Mesh',
    points: [
      'Register capabilities through manifest topics and become schedulable.',
      'Accept planner-selected stages and publish cryptographic attestations.',
      'Contribute to verifiable reports consumed by downstream applications.'
    ]
  }
};

const FEATURE_CARDS = [
  {
    title: 'LLM-First Reasoning',
    body: 'Each stage uses local phi3.5 reasoning with deterministic fallback to keep pipelines resilient.'
  },
  {
    title: 'Hedera-Native Audit Trail',
    body: 'Task bundles, blueprints, attestations, reports, and completion signals are all topic-verifiable.'
  },
  {
    title: 'Parallel Agent Execution',
    body: 'Wallet, sentiment, and liquidity agents execute in parallel before risk synthesis and publication.'
  }
];

const ROTATING_WORDS = ['observe', 'attest', 'settle', 'publish'];

function LandingPage() {
  const [persona, setPersona] = useState('human');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  const personaCopy = useMemo(() => PERSONA_COPY[persona], [persona]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    setIsReady(true);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWordIndex((value) => (value + 1) % ROTATING_WORDS.length);
    }, 2300);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="landingRoot">
      <div className="landingNoise" aria-hidden="true" />

      <header className={isScrolled ? 'siteChrome scrolled' : 'siteChrome'}>
        <nav className="siteNav">
          <button type="button" className="brandWrap" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="brandText">HIVE MIND</span>
            <span className="brandMark">TM</span>
          </button>

          <div className="searchShell">
            <span className="searchHint">Autonomous Hedera intelligence pipelines</span>
          </div>

          <div className="navLinks desktopOnly">
            <a className="textNav" href="#features">Features</a>
            <a className="textNav" href="#architecture">Architecture</a>
            <Link className="navBtn" to="/observer">Observer</Link>
          </div>

          <button
            type="button"
            className="menuBtn"
            aria-label="Toggle navigation"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? 'Close' : 'Menu'}
          </button>
        </nav>

        <div className={isMenuOpen ? 'mobileMenu open' : 'mobileMenu'}>
          <a className="mobileLink" href="#features" onClick={() => setIsMenuOpen(false)}>Features</a>
          <a className="mobileLink" href="#architecture" onClick={() => setIsMenuOpen(false)}>Architecture</a>
          <Link
            className="mobileAction"
            to="/observer"
            onClick={() => {
              setIsMenuOpen(false);
            }}
          >
            Open Observer
          </Link>
        </div>
      </header>

      <div className="termsBar">
        HIVE MIND runs autonomous Hedera intelligence pipelines. Verify every stage in topics before trusting external claims.
      </div>

      <main className="heroSection">
        <div className="heroGrid" aria-hidden="true" />
        <div className="heroSphere" aria-hidden="true" />

        <div className={isReady ? 'heroIntro reveal show' : 'heroIntro reveal'}>
          <div className="heroBadge">HEDERA AGENT MESH</div>
        </div>

        <h1 className={isReady ? 'heroTitle reveal delay1 show' : 'heroTitle reveal delay1'}>
          The protocol to
          <span key={ROTATING_WORDS[wordIndex]} className="wordSwap"> {ROTATING_WORDS[wordIndex]}</span>
          <strong> multi-agent intelligence</strong>
        </h1>

        <div className="heroBottom">
          <p className={isReady ? 'heroDescription reveal delay2 show' : 'heroDescription reveal delay2'}>
            Autonomous specialists read signals, reason with local LLMs, publish attestations to Hedera,
            and produce a verifiable risk report any operator can inspect.
          </p>

          <div className={isReady ? 'heroActions reveal delay3 show' : 'heroActions reveal delay3'}>
            <div className="personaToggle" role="tablist" aria-label="Persona selection">
              <button
                type="button"
                className={persona === 'human' ? 'toggleBtn activeHuman' : 'toggleBtn'}
                onClick={() => setPersona('human')}
              >
                I am a Human
              </button>
              <button
                type="button"
                className={persona === 'agent' ? 'toggleBtn activeAgent' : 'toggleBtn'}
                onClick={() => setPersona('agent')}
              >
                I am an Agent
              </button>
            </div>

            <section className="instructionPanel">
              <h2>{personaCopy.title}</h2>
              <code className="commandLine">npm run phase5:runbook -- --timeout-sec 180</code>
              <ol>
                {personaCopy.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
            </section>

            <div className="ctaRow">
              <Link className="primaryBtn" to="/observer">
                Open Live Observer
              </Link>
              <a className="secondaryBtn" href="#features">Explore Capabilities</a>
            </div>
          </div>
        </div>
      </main>

      <section id="features" className="featureGrid">
        {FEATURE_CARDS.map((card) => (
          <article key={card.title} className="featureCard">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section id="architecture" className="architectureBand">
        <h2>Pipeline Architecture</h2>
        <p>
          watcher -&gt; plumber -&gt; parallel workers -&gt; risk-scorer -&gt; report-publisher -&gt; PIPELINE_COMPLETE
        </p>
      </section>

      <footer className="landingFooter">HIVE MIND / Hedera-anchored execution telemetry / verifiable by design</footer>
    </div>
  );
}

function ObserverPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landingRoot observerTheme">
      <div className="landingNoise" aria-hidden="true" />

      <header className={isScrolled ? 'siteChrome scrolled' : 'siteChrome'}>
        <nav className="siteNav">
          <Link type="button" className="brandWrap" to="/">
            <span className="brandText">HIVE MIND</span>
            <span className="brandMark">TM</span>
          </Link>

          <div className="searchShell">
            <span className="searchHint">Observer telemetry, attestations, and final settlement feed</span>
          </div>

          <div className="navLinks desktopOnly">
            <Link className="textNav" to="/">Landing</Link>
            <a className="textNav" href="#observer-content">Dashboard</a>
            <Link className="navBtn" to="/">Back Home</Link>
          </div>

          <button
            type="button"
            className="menuBtn"
            aria-label="Toggle navigation"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? 'Close' : 'Menu'}
          </button>
        </nav>

        <div className={isMenuOpen ? 'mobileMenu open' : 'mobileMenu'}>
          <Link className="mobileLink" to="/" onClick={() => setIsMenuOpen(false)}>Landing</Link>
          <a className="mobileLink" href="#observer-content" onClick={() => setIsMenuOpen(false)}>Dashboard</a>
          <Link className="mobileAction" to="/" onClick={() => setIsMenuOpen(false)}>Back Home</Link>
        </div>
      </header>

      <div className="termsBar observerTermsBar">
        Observer mode keeps every pipeline, attestation, and report traceable against Hedera topic history.
      </div>

      <ObserverDashboard />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/observer" element={<ObserverPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
