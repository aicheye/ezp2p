import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "warning";
  actions?: React.ReactNode;
}

/**
 * A consistent modal component for the EZP2P Arcade.
 * Uses a Portal to render outside the main DOM tree, ensuring it sits above
 * CRT distortions and layout transforms.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  variant = "primary",
  actions,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className={`arcade-modal arcade-modal--${variant}`}>
        {title && (
          <div className="arcade-modal__title">
            <h2
              className={`pixel-text glow-text-soft ${variant === "primary" ? "color-primary" : `color-${variant}`}`}
              style={{ fontSize: "1.25rem" }}
            >
              {title}
            </h2>
          </div>
        )}

        <div className="arcade-modal__content">{children}</div>

        {actions && <div className="arcade-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
