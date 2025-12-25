import { useEffect, useState } from "react";
import { CRTScreen } from "./CRTScreen";

interface BootScreenProps {
  onComplete: () => void;
}

const BOOT_LINES = [
  // BIOS initialization
  { text: "EZP2P ARCADE BIOS v2.4.1", delay: 100 },
  { text: "Copyright (C) 2025 Sean Yang. All rights reserved.", delay: 200 },
  { text: "", delay: 400 },

  // Memory check
  { text: "Performing memory test...", delay: 500 },
  { text: "  Extended Memory: 4096KB ..... OK", delay: 700 },
  { text: "  Video Memory: 2048KB ........ OK", delay: 850 },
  { text: "  Y2K Compliance: ............. PROBABLY", delay: 950 },
  { text: "", delay: 1050 },

  // Hardware detection
  { text: "Detecting hardware:", delay: 1150 },
  { text: "  Display: CRT-80x25 PHOSPHOR-GREEN", delay: 1300 },
  { text: "  Input: KEYBOARD HID-COMPLIANT", delay: 1420 },
  { text: "  Input: MOUSE PS/2-COMPATIBLE", delay: 1520 },
  { text: "  Sound: [DISABLED]", delay: 1620 },
  { text: "  Flux Capacitor: ............. STANDBY", delay: 1720 },
  { text: "", delay: 1820 },

  // Network initialization
  { text: "Initializing P2P network stack:", delay: 1920 },
  { text: "  Loading WebRTC driver .......... DONE", delay: 2120 },
  { text: "  Binding PeerJS adapter ......... DONE", delay: 2320 },
  { text: "  Connecting signal server ....... STANDBY", delay: 2520 },
  { text: "  Checking for spyware ........... NONE :)", delay: 2670 },
  { text: "", delay: 2770 },

  // Game loading
  { text: "Loading game modules:", delay: 2870 },
  { text: "  > dots-and-boxes.rom ........... LOADED", delay: 3070 },
  { text: "  > secret-game.rom .............. [LOCKED]", delay: 3220 },
  { text: "  Game registry: 1 title(s) available", delay: 3370 },
  { text: "", delay: 3470 },

  // Easter egg sequence
  { text: "Initializing secret protocols...", delay: 3570 },
  { text: "  IDDQD: God mode ............... DENIED", delay: 3720 },
  { text: "  UUDDLRLRBA: Konami boost ...... ARMED", delay: 3870 },
  { text: "", delay: 3970 },

  // Final checks
  { text: "Running system diagnostics...", delay: 4070 },
  { text: "  All subsystems operational.", delay: 4270 },
  { text: "", delay: 4370 },
  { text: "BOOT SEQUENCE COMPLETE", delay: 4570 },
];

/**
 * Boot screen with CRT warm-up animation and terminal-style boot sequence.
 * Shows fade-in effect AND terminal output simultaneously.
 */
export function BootScreen({ onComplete }: BootScreenProps) {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [bootComplete, setBootComplete] = useState(false);

  // Reveal lines one by one and auto-transition when done
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_LINES.forEach((line, index) => {
      const timer = setTimeout(() => {
        setVisibleLines(index + 1);
      }, line.delay);
      timers.push(timer);
    });

    // Auto-transition to launch screen after boot complete
    const completeTimer = setTimeout(
      () => {
        setBootComplete(true);
        onComplete();
      },
      BOOT_LINES[BOOT_LINES.length - 1].delay + 400,
    );
    timers.push(completeTimer);

    return () => timers.forEach((t) => clearTimeout(t));
  }, [onComplete]);

  const getLineColor = (text: string) => {
    if (
      text.startsWith("╔") ||
      text.startsWith("╚") ||
      text.startsWith("║") ||
      text.startsWith("═")
    ) {
      return "var(--arcade-primary)";
    }
    if (text.includes("DENIED")) {
      return "var(--arcade-warning, #ff6b6b)";
    }
    if (
      text.includes("OK") ||
      text.includes("DONE") ||
      text.includes("LOADED") ||
      text.includes("COMPLETE") ||
      text.includes("ARMED") ||
      text.includes(":)")
    ) {
      return "var(--arcade-accent)";
    }
    if (
      text.includes("[DISABLED]") ||
      text.includes("STANDBY") ||
      text.includes("[LOCKED]") ||
      text.includes("PROBABLY")
    ) {
      return "var(--arcade-text-dim)";
    }
    if (text.includes("kick ass") || text.includes("Press any key")) {
      return "var(--arcade-text-dim)";
    }
    if (text.startsWith("  >")) {
      return "var(--arcade-accent)";
    }
    if (text.startsWith("  ")) {
      return "var(--arcade-text)";
    }
    return "var(--arcade-primary)";
  };

  return (
    <CRTScreen warmup>
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          cursor: bootComplete ? "pointer" : "default",
        }}
        onClick={onComplete}
      >
        <div
          className="terminal-text"
          style={{
            position: "relative",
            flex: 1,
            width: "100%",
            overflow: "hidden",
            fontFamily: "var(--font-terminal)",
            fontSize: "0.8rem",
            lineHeight: "1.5",
            whiteSpace: "pre",
          }}
        >
          {/* Absolute container to force bottom anchoring and upward growth */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {BOOT_LINES.slice(0, visibleLines).map((line, index) => (
              <div
                key={index}
                style={{
                  color: getLineColor(line.text),
                  opacity: line.text === "" ? 0 : 1,
                  minHeight: "1.5em",
                }}
              >
                {line.text || " "}
              </div>
            ))}

            {/* Blinking cursor while booting */}
            {!bootComplete && (
              <span
                className="blink"
                style={{ color: "var(--arcade-primary)" }}
              >
                ▌
              </span>
            )}
          </div>
        </div>
      </div>
    </CRTScreen>
  );
}
