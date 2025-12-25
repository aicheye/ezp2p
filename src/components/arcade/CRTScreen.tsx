import React from "react";

interface CRTScreenProps {
  children: React.ReactNode;
  warmup?: boolean;
}

/**
 * CRT Screen wrapper component that provides the arcade cabinet display effect.
 * Includes scanlines, noise, screen curvature, and optional warmup animation.
 */
export function CRTScreen({ children, warmup = false }: CRTScreenProps) {
  return (
    <div className={`crt-screen ${warmup ? "crt-warmup" : ""}`}>
      <div className="crt-scanlines" />
      <div className="crt-noise" />
      <div className="crt-flicker" />
      <div className="crt-glitch" />
      <div className="crt-wrapper">
        <div className={`crt-content ${warmup ? "crt-content--boot" : ""}`}>
          {children}
          {!warmup && (
            <footer className="crt-footer">
              <span className="crt-footer__info">
                <span>peer-to-peer</span>
                <span className="crt-footer__dot">·</span>
                <span>no servers</span>
                <span className="crt-footer__dot">·</span>
                <span>no accounts</span>
                <span className="crt-footer__dot">·</span>
              </span>
              <a
                href="https://github.com/aicheye/ezp2p"
                target="_blank"
                rel="noopener noreferrer"
              >
                repo
              </a>
              <span className="crt-footer__dot">·</span>
              <span>© Sean Yang 2025-{new Date().getFullYear()}</span>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
