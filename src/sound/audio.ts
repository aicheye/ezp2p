type SfxName =
  | "click1"
  | "click2"
  | "err"
  | "err2"
  | "long_blip"
  | "point"
  | "loss"
  | "win"
  | "button_down"
  | "button_up"
  | "startup";

type MusicName = "bg1" | "bg2" | "in_game";

const SFX_PATH: Record<SfxName, string> = {
  click1: "/sfx/click1.wav",
  click2: "/sfx/click2.wav",
  err: "/sfx/err.wav",
  err2: "/sfx/err2.wav",
  long_blip: "/sfx/long_blip.wav",
  point: "/sfx/point.wav",
  button_down: "/sfx/button_down.wav",
  button_up: "/sfx/button_up.wav",
  loss: "/sfx/loss.wav",
  win: "/sfx/win.wav",
  startup: "/sfx/startup.wav",
};

const MUSIC_PATH: Record<MusicName, string> = {
  bg1: "/music/bg1.wav",
  bg2: "/music/bg2.wav",
  in_game: "/music/in_game.wav",
};

class AudioManager {
  sfx: Partial<Record<SfxName, HTMLAudioElement>> = {};
  music: Partial<Record<MusicName, HTMLAudioElement>> = {};
  menuPlaylist: MusicName[] = ["bg1", "bg2"];
  currentMenuIndex = 0;
  currentMusic: HTMLAudioElement | null = null;
  currentMusicKey: MusicName | null = null;
  startupAudio: HTMLAudioElement | null = null;
  clickToggle = false;
  inited = false;
  // If autoplay is blocked, we'll wait for first user gesture to play queued startup
  needsUserGesture = false;
  startupHandler: (() => void) | null = null;
  // Track whether we've attempted a muted autoplay for music
  attemptedMutedAutoplay = false;

  init() {
    if (this.inited) return;
    this.inited = true;

    // Preload sfx
    (Object.keys(SFX_PATH) as SfxName[]).forEach((k) => {
      const a = new Audio(SFX_PATH[k]);
      a.preload = "auto";
      this.sfx[k] = a;
    });

    // Preload music
    (Object.keys(MUSIC_PATH) as MusicName[]).forEach((k) => {
      const a = new Audio(MUSIC_PATH[k]);
      a.preload = "auto";
      a.loop = false;
      a.volume = 0.6;
      this.music[k] = a;
    });

    // Startup audio reference
    this.startupAudio = this.sfx.startup ?? null;

    // Global click handler for buttons
    document.addEventListener("click", (e) => {
      try {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest("button") as HTMLButtonElement | null;
        if (!btn) return;

        if (btn.disabled) {
          this.playErr();
        } else {
          this.playClick();
        }
        
      } catch (err) {
        // ignore
      }
    });
  }

  playAudioElement(a: HTMLAudioElement | null) {
    if (!a) return;
    // clone to allow overlapping
    const clone = a.cloneNode(true) as HTMLAudioElement;
    clone.volume = a.volume ?? 1;
    clone.play().catch(() => {});
    return clone;
  }

  fadeIn(element: HTMLAudioElement, targetVolume = 0.6, duration = 1500) {
    try {
      const start = performance.now();
      const initial = Math.max(0, element.volume || 0);
      const delta = targetVolume - initial;
      if (delta <= 0) {
        element.volume = targetVolume;
        return;
      }
      const tick = () => {
        const now = performance.now();
        const t = Math.min(1, (now - start) / duration);
        element.volume = initial + delta * t;
        if (t < 1) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    } catch {}
  }

  playClick() {
    // Randomly pick between click1 and click2
    const which: SfxName = Math.random() > 0.5 ? "click1" : "click2";
    this.playAudioElement(this.sfx[which] ?? null);
  }

  playButtonDown() {
    this.playAudioElement(this.sfx.button_down ?? null);
  }

  playButtonUp() {
    this.playAudioElement(this.sfx.button_up ?? null);
  }

  playErr() {
    // Randomize between err and err2
    const pick = Math.random() > 0.5 ? "err" : "err2";
    this.playAudioElement(this.sfx[pick] ?? null);
  }

  playLongBlip() {
    this.playAudioElement(this.sfx.long_blip ?? null);
  }

  playPoint() {
    this.playAudioElement(this.sfx.point ?? null);
  }

  playWin() {
    this.playAudioElement(this.sfx.win ?? null);
  }

  playLoss() {
    this.playAudioElement(this.sfx.loss ?? null);
  }

  playStartup() {
    if (!this.startupAudio) return;
    try {
      this.startupAudio.currentTime = 0;
      const p = this.startupAudio.play();
      if (p && typeof (p as Promise<void>)?.catch === "function") {
        (p as Promise<void>).catch(() => {
          // Autoplay blocked — queue startup to play on first user gesture
          this.needsUserGesture = true;
          if (this.startupHandler) return;
          this.startupHandler = () => {
            this.needsUserGesture = false;
            try {
              if (!this.startupAudio) return;
              this.startupAudio.currentTime = 0;
              this.startupAudio.play().catch(() => {});
            } catch {}
            if (this.startupHandler) {
              window.removeEventListener("pointerdown", this.startupHandler);
              this.startupHandler = null;
            }
          };
          window.addEventListener("pointerdown", this.startupHandler);
        });
      }
    } catch {}
  }

  stopStartup() {
    if (!this.startupAudio) return;
    try {
      this.startupAudio.pause();
      this.startupAudio.currentTime = 0;
      // If we queued a handler due to autoplay block, remove it
      if (this.startupHandler) {
        try {
          window.removeEventListener("pointerdown", this.startupHandler);
        } catch {}
        this.startupHandler = null;
        this.needsUserGesture = false;
      }
    } catch {}
  }

  // Menu music alternates bg1/bg2
  playMenuMusic() {
    const key = this.menuPlaylist[this.currentMenuIndex % this.menuPlaylist.length];
    // If the requested menu track is already playing, do nothing to preserve continuity
    if (this.currentMusicKey === key && this.currentMusic && !this.currentMusic.paused) {
      return;
    }
    this.stopMusic();
    this.currentMusicKey = key;
    const a = this.music[key];
    if (!a) return;
    this.currentMusic = a;
    a.currentTime = 0;
    const targetVolume = a.volume ?? 0.6;

    // Try muted autoplay once to satisfy autoplay policies
    if (!this.attemptedMutedAutoplay) {
      this.attemptedMutedAutoplay = true;
      a.muted = true;
      a.volume = targetVolume; // keep target stored
      a.play()
        .then(() => {
          // Unmute and fade in
          a.muted = false;
          a.currentTime = 0;
          this.fadeIn(a, targetVolume, 1500);
        })
        .catch(() => {
          // If muted autoplay fails (rare), try normal play and fallback to gesture
          a.muted = false;
          a.play().catch(() => {
            // Fallback: wait for first user gesture to play
            const handler = () => {
              try {
                a.play().catch(() => {});
              } catch {}
              window.removeEventListener("pointerdown", handler);
            };
            window.addEventListener("pointerdown", handler, { once: true });
          });
        });
    } else {
      a.play().catch(() => {});
    }

    a.onended = () => {
      this.currentMenuIndex++;
      this.currentMusicKey = null;
      this.playMenuMusic();
    };
  }

  playGameMusic() {
    // If game music is already playing, don't restart it
    if (this.currentMusicKey === "in_game" && this.currentMusic && !this.currentMusic.paused) {
      return;
    }
    this.stopMusic();
    const a = this.music.in_game;
    if (!a) return;
    this.currentMusic = a;
    this.currentMusicKey = "in_game";
    a.loop = true;
    a.currentTime = 0;
    const targetVolume = a.volume ?? 0.6;
    // Try muted autoplay then fade-in like menu music
    if (!this.attemptedMutedAutoplay) {
      this.attemptedMutedAutoplay = true;
      a.muted = true;
      a.volume = targetVolume;
      a.play()
        .then(() => {
          a.muted = false;
          a.currentTime = 0;
          this.fadeIn(a, targetVolume, 1500);
        })
        .catch(() => {
          a.muted = false;
          a.play().catch(() => {});
        });
    } else {
      a.play().catch(() => {});
      this.fadeIn(a, targetVolume, 1500);
    }
  }

  stopMusic() {
    if (this.currentMusic) {
      try {
        // stop and reset
        this.currentMusic.pause();
        this.currentMusic.currentTime = 0;
        this.currentMusic.onended = null;
        this.currentMusic.muted = false;
        this.currentMusic.volume = 0.6;
      } catch {}
      this.currentMusic = null;
      this.currentMusicKey = null;
    }
  }
}

export const audio = new AudioManager();
 
export default audio;
