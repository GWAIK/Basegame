const FADE_SECONDS = 0.7;
const MAX_QUEUED_SOUNDS = 8;

interface Cue {
  url: string;
  volume: number;
}

interface PlayingBed {
  url: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Two buses that outlive a scene.
 * Ambience is one looping bed with a crossfade. Effects overlap and finish on their own.
 * A browser stays silent until unlock() runs inside a click or a key press.
 */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterVolume = 1;
  private held = false;
  private pendingAmbience: Cue | null = null;
  private readonly pendingSounds: Cue[] = [];
  private ambience: PlayingBed | null = null;
  private ambienceToken = 0;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  /**
   * Opens the audio device. Call this from a click or a key press.
   * Safari ignores pointerdown, and it drops a sound started before the device is running.
   */
  unlock(): void {
    const context = this.ensureContext();
    if (this.held) {
      return;
    }
    if (context.state === 'running') {
      this.flushPending();
      return;
    }
    void context.resume().then(() => {
      if (this.held) {
        void context.suspend();
        return;
      }
      if (context.state === 'running') {
        this.flushPending();
      }
    });
  }

  /** Freezes the bed and effects on the same frame as the pause menu. */
  setPaused(paused: boolean): void {
    this.held = paused;
    const context = this.context;
    if (!context) {
      return;
    }
    if (paused) {
      void context.suspend();
      return;
    }
    void context.resume().then(() => {
      if (this.held) {
        return;
      }
      if (context.state === 'running') {
        this.flushPending();
      }
    });
  }

  /** Scales ambience and effects together. Settings can call this later. */
  setMasterVolume(volume: number): void {
    this.masterVolume = clamp01(volume);
    if (this.master) {
      this.master.gain.value = this.masterVolume;
    }
  }

  /**
   * Fades to a looping bed. The same file keeps playing.
   * Pass null to fade the bed out. Before unlock(), the request waits.
   */
  playAmbience(url: string | null, volume: number): void {
    const level = clamp01(volume);
    if (!this.isRunning()) {
      this.pendingAmbience = url === null ? null : { url, volume: level };
      return;
    }
    if (url === null) {
      this.ambienceToken += 1;
      this.fadeOut(this.ambience);
      this.ambience = null;
      return;
    }
    if (this.ambience?.url === url) {
      this.ambienceToken += 1;
      this.ramp(this.ambience.gain, level);
      return;
    }
    void this.crossfade(url, level);
  }

  /**
   * Decodes a file before it is played. Playback still waits for a click:
   * Safari will not start audio until then.
   */
  preload(url: string): Promise<void> {
    this.ensureContext();
    return this.buffer(url).then(() => undefined);
  }

  /** Plays a short sound over the bed. Before unlock(), it waits for the gesture. */
  playSound(url: string, volume: number): void {
    const cue = { url, volume: clamp01(volume) };
    if (!this.isRunning()) {
      this.pendingSounds.push(cue);
      if (this.pendingSounds.length > MAX_QUEUED_SOUNDS) {
        this.pendingSounds.shift();
      }
      return;
    }
    void this.startSound(cue);
  }

  private async crossfade(url: string, volume: number): Promise<void> {
    const token = ++this.ambienceToken;
    const buffer = await this.buffer(url);
    if (token !== this.ambienceToken || !this.context || !this.master) {
      return;
    }
    if (!buffer || this.context.state !== 'running') {
      this.pendingAmbience = { url, volume };
      return;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + FADE_SECONDS);
    source.connect(gain);
    gain.connect(this.master);
    source.start(now);

    this.fadeOut(this.ambience);
    this.ambience = { url, source, gain };
  }

  private fadeOut(bed: PlayingBed | null): void {
    if (!bed || !this.context) {
      return;
    }
    const now = this.context.currentTime;
    this.ramp(bed.gain, 0);
    const source = bed.source;
    source.stop(now + FADE_SECONDS + 0.05);
    source.onended = () => {
      source.disconnect();
      bed.gain.disconnect();
    };
  }

  private ramp(gain: GainNode, value: number): void {
    if (!this.context) {
      return;
    }
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value, now + FADE_SECONDS);
  }

  private async startSound(cue: Cue): Promise<void> {
    const context = this.context;
    const master = this.master;
    if (!context || !master) {
      return;
    }
    const buffer = await this.buffer(cue.url);
    if (!buffer || context.state !== 'running') {
      this.pendingSounds.push(cue);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = cue.volume;
    source.connect(gain);
    gain.connect(master);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(url);
    if (cached) {
      return cached;
    }

    const loading = this.loadBuffer(url).then((buffer) => {
      if (!buffer) {
        this.buffers.delete(url);
      }
      return buffer;
    });
    this.buffers.set(url, loading);
    return loading;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) {
      return this.context;
    }
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = this.masterVolume;
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    context.addEventListener('statechange', () => {
      if (this.held && context.state === 'running') {
        void context.suspend();
        return;
      }
      if (context.state === 'running') {
        this.flushPending();
      }
    });
    return context;
  }

  /** Starts sounds that were asked for before Safari allowed audio. */
  private flushPending(): void {
    if (!this.isRunning()) {
      return;
    }
    const ambience = this.pendingAmbience;
    this.pendingAmbience = null;
    if (ambience) {
      this.playAmbience(ambience.url, ambience.volume);
    }
    const sounds = this.pendingSounds.splice(0);
    for (const sound of sounds) {
      this.playSound(sound.url, sound.volume);
    }
  }

  private isRunning(): boolean {
    return this.context?.state === 'running' && this.master !== null;
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    const context = this.context;
    if (!context) {
      return null;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      const encoded = await response.arrayBuffer();
      return await this.decode(context, encoded);
    } catch (error) {
      console.warn(`Could not load sound ${url}`, error);
      return null;
    }
  }

  /** Safari drops the original bytes, and its promise form of decode often never finishes. */
  private decode(context: AudioContext, encoded: ArrayBuffer): Promise<AudioBuffer> {
    const copy = encoded.slice(0);
    return new Promise((resolve, reject) => {
      context.decodeAudioData(copy, resolve, reject);
    });
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
