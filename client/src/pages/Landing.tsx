'use client';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "react-router-dom";
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import "./Landing.css";
import DotGrid from './DotGrid';
import solarOracleImg from '../assets/solar-oracle.png';
import stakingImg from '../assets/staking.png';

gsap.registerPlugin(ScrollTrigger);

export default function Landing() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  // Scroll-driven "slanted -> straight" reveal for cards & product images
  useEffect(() => {
    // Respect users who prefer reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      // Role cards: tilt back, then straighten as they scroll into view
      const cards = gsap.utils.toArray<HTMLElement>('.landing-card');
      cards.forEach((card) => {
        gsap.fromTo(
          card,
          { rotateX: -45, y: 60, opacity: 0, transformOrigin: '50% 100%' },
          {
            rotateX: 0,
            y: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: card,
              start: 'top 90%',   // begin as the card enters the viewport
              end: 'top 45%',     // fully straight once it reaches upper-middle
              scrub: true,
            },
          }
        );
      });

      // Product dashboard images: subtle 3D slant that straightens on scroll
      const images = gsap.utils.toArray<HTMLElement>('.product-image-wrapper');
      images.forEach((img, i) => {
        gsap.fromTo(
          img,
          {
            rotateX: 22,
            rotateY: i % 2 === 0 ? -16 : 16, // alternate slant direction
            y: 70,
            opacity: 0,
            transformOrigin: '50% 50%',
          },
          {
            rotateX: 0,
            rotateY: 0,
            y: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: img,
              start: 'top 90%',
              end: 'top 40%',
              scrub: true,
            },
          }
        );
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <>
      <div className={`landing-background ${darkMode ? 'dark' : ''}`} />
      
      <DotGrid
        dotSize={5}
        gap={15}
        baseColor={darkMode ? "#1e293b" : "#f0fdf4"}
        activeColor={darkMode ? "#22c55e" : "#5227FF"}
        proximity={120}
        shockRadius={250}
        shockStrength={5}
        resistance={750}
        returnDuration={1.5}
      />

      <div ref={rootRef} className={`landing ${darkMode ? 'dark' : ''}`}>
        {/* Navbar */}
        <nav className="landing-nav">
          <div className="nav-logo">
            <span className="nav-logo-text">Aethera</span>
          </div>
          <div className="nav-links">
            <a href="#features" className="nav-link">Features</a>
            <a href="#products" className="nav-link">Products</a>
            <a href="https://github.com/Aethera-Lab" target="_blank" rel="noopener noreferrer" className="nav-link">GitHub</a>
            <a href="https://x.com/aetheraFi" target="_blank" rel="noopener noreferrer" className="nav-link">Twitter</a>
          </div>
          <div className="nav-actions">
            <button 
              className="theme-toggle" 
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <button className="nav-cta" onClick={() => navigate("/installer")}>
              Launch App
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            Built on Aptos
          </div>
          <h1 className="hero-title">
            Decentralized Solar<br />
            <span className="hero-gradient">Financing on Aptos</span>
          </h1>
          <p className="hero-sub">
            Empowering solar installers with blockchain-backed funding and providing 
            investors access to vetted renewable energy projects with transparent, 
            tokenized returns.
          </p>
          <div className="hero-buttons">
            <button className="hero-btn primary" onClick={() => navigate("/installer")}>
              Get Started
            </button>
            <button className="hero-btn secondary" onClick={() => navigate("/invest")}>
              Start Investing
            </button>
          </div>

          {/* Stats */}
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">$2.5M+</span>
              <span className="stat-label">Total Value Locked</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">150+</span>
              <span className="stat-label">Solar Projects</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">10%</span>
              <span className="stat-label">Avg. APY</span>
            </div>
          </div>
        </section>

        {/* Role Cards Section */}
        <section id="features" className="cards-section">
          <h2 className="section-title">Choose Your Path</h2>
          <p className="section-sub">
            Whether you're funding solar projects or seeking investment opportunities, 
            Aethera connects you to the future of renewable energy finance.
          </p>

          <div className="landing-cards">
            {/* Solar Installer */}
            <div className="landing-card">
              <div className="card-icon blue">
                <span>☀️</span>
              </div>
              <h2>Solar Installer</h2>
              <p>
                Submit your solar projects, pass KYC, and get funded by a global
                pool of investors.
              </p>
              <ul className="card-features">
                <li>Easy project submission</li>
                <li>Streamlined KYC process</li>
                <li>Global investor access</li>
              </ul>
              <button
                className="card-btn green"
                onClick={() => navigate("/installer")}
              >
                Installer Portal
              </button>
            </div>

            {/* Investor */}
            <div className="landing-card featured">
              <div className="featured-badge">Popular</div>
              <div className="card-icon green">
                <span>🔬</span>
              </div>
              <h2>Investor</h2>
              <p>
                Discover vetted renewable energy projects and earn yields through
                tokenized assets.
              </p>
              <ul className="card-features">
                <li>Vetted project listings</li>
                <li>Tokenized investments</li>
                <li>Transparent returns</li>
              </ul>
              <button
                className="card-btn green"
                onClick={() => navigate("/invest")}
              >
                Start Investing
              </button>
            </div>

            {/* Platform Admin */}
            <div className="landing-card">
              <div className="card-icon gray">
                <span>🛡️</span>
              </div>
              <h2>Platform Admin</h2>
              <p>
                Review projects, approve KYC, mint tokens, and manage fund
                disbursement.
              </p>
              <ul className="card-features">
                <li>Project review tools</li>
                <li>KYC management</li>
                <li>Token minting controls</li>
              </ul>
              <button
                className="card-btn dark"
                onClick={() => navigate("/admin")}
              >
                Admin Login
              </button>
            </div>
          </div>
        </section>

        {/* Products Showcase */}
        <section id="products" className="products-section">
          <h2 className="section-title">Our Products</h2>
          <p className="section-sub">
            Powered by Aptos blockchain for speed, security, and transparency.
          </p>

          {/* Solar Oracle Product */}
          <div className="product-showcase">
            <div className="product-content">
              <div className="product-badge">Data Feed</div>
              <h3 className="product-title">Solar Oracle</h3>
              <p className="product-desc">
                Real-time solar irradiance data fetched directly from the Aptos blockchain. 
                Track DNI, GHI, and solar potential across multiple locations with 
                on-chain verified data.
              </p>
              <ul className="product-features">
                <li>
                  <span className="feature-icon">⇢</span>
                  Real-time irradiance metrics (DNI, GHI, Lat Tilt)
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  Multi-location tracking across the US
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  On-chain verified data feeds
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  Automatic updates every hour
                </li>
              </ul>
              <button
                className="product-btn"
                onClick={() => window.open("https://solar-oracle-lime.vercel.app/", "_blank")}>
               View Oracle Dashboard
</button>
            </div>
            <div className="product-image-wrapper">
              <div className="product-image-glow"></div>
              <img src={solarOracleImg} alt="Solar Oracle Dashboard" className="product-image" />
            </div>
          </div>

          {/* Staking Product */}
          <div className="product-showcase reverse">
            <div className="product-content">
              <div className="product-badge purple">Earn Rewards</div>
              <h3 className="product-title">APT Staking</h3>
              <p className="product-desc">
                Stake your APT tokens and earn up to 10% APY. Secure your tokens 
                with flexible lock durations and track your staking rewards in real-time.
              </p>
              <ul className="product-features">
                <li>
                  <span className="feature-icon">⇢</span>
                  Up to 10% APY on staked APT
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  Flexible lock durations (1 min to 365 days)
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  Real-time vault statistics
                </li>
                <li>
                  <span className="feature-icon">⇢</span>
                  Secure smart contract staking
                </li>
              </ul>
              <button className="product-btn purple" onClick={() => navigate("/staking")}>
                Start Staking
              </button>
            </div>
            <div className="product-image-wrapper">
              <div className="product-image-glow purple"></div>
              <img src={stakingImg} alt="Staking Dashboard" className="product-image" />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Ready to Power the Future?</h2>
            <p className="cta-sub">
              Join the decentralized solar revolution. Connect your wallet and start 
              contributing to renewable energy projects today.
            </p>
            <div className="cta-buttons">
              <button className="cta-btn primary" onClick={() => navigate("/installer")}>
                Get Started Now
              </button>
              <a href="https://github.com/AetheraLab" target="_blank" rel="noopener noreferrer" className="cta-btn secondary">
                Read Documentation
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-logo">
                <span className="footer-logo-icon">⚡</span>
                <span className="footer-logo-text">Aethera</span>
              </div>
              <p className="footer-tagline">
                Decentralized solar financing on Aptos blockchain.
              </p>
              <div className="footer-socials">
                <a href="https://twitter.com/aetheraFi" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Twitter">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a href="https://github.com/Aethera-Lab" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="GitHub">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                </a>
                <a href="https://discord.gg" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Discord">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </a>
              </div>
            </div>

            <div className="footer-links-grid">
              <div className="footer-column">
                <h4>Products</h4>
                <a onClick={()=>navigate("/installer")}>Installer Portal</a>
                <a onClick={()=>navigate("/invest")}>Investor Dashboard</a>
                <a href='https://solar-oracle-lime.vercel.app/' target="_blank" rel="noopener noreferrer">Solar Oracle</a></div>
              <div className="footer-column">
                <h4>Resources</h4>
                <a href="https://github.com/Aethera-Lab" target="_blank" rel="noopener noreferrer">Documentation</a>
                <a href="https://github.com/Aethera-Lab" target="_blank" rel="noopener noreferrer">GitHub</a>
                <a href="https://aptosnetwork.com" target="_blank" rel="noopener noreferrer">Aptos Network</a>
                <a href="https://explorer.aptoslabs.com" target="_blank" rel="noopener noreferrer">Block Explorer</a>
              </div>
              <div className="footer-column">
                <h4>Community</h4>
                <a href="https://x.com/aetheraFi" target="_blank" rel="noopener noreferrer">Twitter</a>
                <a href="https://discord.gg" target="_blank" rel="noopener noreferrer">Discord</a>
                <a href="https://t.me/Rajdeep988" target="_blank" rel="noopener noreferrer">Telegram</a>
                <a href="https://medium.com" target="_blank" rel="noopener noreferrer">Blog</a>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p>&copy; 2026 Aethera. All rights reserved.</p>
            <div className="footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
