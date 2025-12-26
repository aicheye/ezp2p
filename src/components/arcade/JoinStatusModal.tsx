import { useEffect } from "react";
import { audio } from "../../sound/audio";
import { Modal } from "./Modal";

interface JoinStatusModalProps {
  status:
  | "not-found"
  | "capacity-reached"
  | "in-game"
  | "denied"
  | "waiting-approval"
  | "connecting"
  | null;
  error?: string | null;
  onClose: () => void;
}

/**
 * Modal overlay for displaying join status messages.
 */
export function JoinStatusModal({
  status,
  error,
  onClose,
}: JoinStatusModalProps) {
  // Don't show modal if everything is fine (no error, and status is null or connecting)
  if (!error && (!status || status === "connecting")) return null;

  const isKicked = error?.toLowerCase().includes("kicked");
  const isWaiting = status === "waiting-approval" && !error;

  const getTitle = () => {
    if (isKicked) return "KICKED";

    switch (status) {
      case "not-found":
        return "LOBBY NOT FOUND";
      case "capacity-reached":
        return "LOBBY FULL";
      case "in-game":
        return "GAME IN PROGRESS";
      case "denied":
        return "REQUEST DENIED";
      case "waiting-approval":
        return "WAITING FOR HOST";
    }

    if (error) return "ERROR";
    return "UNKNOWN ERROR";
  };

  const getMessage = () => {
    if (error) return error;

    switch (status) {
      case "not-found":
        return "The lobby code you entered does not exist or has expired.";
      case "capacity-reached":
        return "This lobby has reached its maximum capacity.";
      case "in-game":
        return "A game is already in progress in this lobby.";
      case "denied":
        return "The host has denied your join request.";
      case "waiting-approval":
        return "Your request to join has been sent. Waiting for host approval...";
      default:
        return "An unknown error occurred.";
    }
  };

  const variant = isWaiting ? "secondary" : "danger";

  useEffect(() => {
    // Play error sound for error/denied states when modal appears
    if (error || status === "not-found" || status === "capacity-reached" || status === "in-game" || status === "denied") {
      audio.playErr();
    }
  }, [error, status]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={getTitle()}
      variant={variant}
      actions={
        <button
          className={`arcade-btn arcade-btn--${variant === "secondary" ? "secondary" : "danger"}`}
          onClick={onClose}
        >
          {isWaiting ? "CANCEL" : "BACK TO MENU"}
        </button>
      }
    >
      <p className="terminal-text" style={{ fontSize: "1.25rem" }}>
        {getMessage()}
      </p>

      {isWaiting && (
        <div
          className="terminal-text blink"
          style={{
            color: "var(--arcade-accent)",
            marginTop: "2.5rem",
            fontSize: "1.5rem",
          }}
        >
          ● ● ●
        </div>
      )}
    </Modal>
  );
}
