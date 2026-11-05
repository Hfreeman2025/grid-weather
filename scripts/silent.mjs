// An OfflineAudioContext prevents automated pages from opening an audio device.
// Chromium and Firefox are also muted by the launch helper.

/** Runs in the page before its own scripts: `new AudioContext()` gets a context with no output device. */
export function silenceLiveAudio() {
  const Offline = window.OfflineAudioContext;
  if (!Offline) return;
  const now = () => performance.now() / 1000;
  class DeviceFreeAudioContext extends Offline {
    #base = now();
    #frozen = 0;
    #paused = false;
    #state = 'running';
    constructor() {
      super(2, 128, 44100);
    }
    get currentTime() {
      return this.#paused ? this.#frozen : now() - this.#base;
    }
    get state() {
      return this.#state;
    }
    get baseLatency() {
      return 0;
    }
    get outputLatency() {
      return 0;
    }
    getOutputTimestamp() {
      return { contextTime: this.currentTime, performanceTime: performance.now() };
    }
    resume() {
      if (this.#paused) {
        this.#base = now() - this.#frozen;
        this.#paused = false;
      }
      this.#state = 'running';
      return Promise.resolve();
    }
    suspend() {
      if (!this.#paused) {
        this.#frozen = this.currentTime;
        this.#paused = true;
      }
      this.#state = 'suspended';
      return Promise.resolve();
    }
    close() {
      void this.suspend();
      this.#state = 'closed';
      return Promise.resolve();
    }
  }
  window.AudioContext = DeviceFreeAudioContext;
  window.webkitAudioContext = DeviceFreeAudioContext;
}
