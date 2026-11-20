// Every sound in Costa Sol is synthesized with WebAudio — no audio files, no
// network. An engine hum that follows the car's speed, a two-tone siren, gunshots,
// pickup blips and a mission jingle, all from oscillators and filtered noise.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let sirenOsc = null;
  let sirenGain = null;

  /** Create the context on the first user gesture (browsers demand it). */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      return true;
    } catch {
      return false;
    }
  }

  /** A short burst of white noise through a filter: the raw material of shots and crashes. */
  function noiseBurst(duration, filterFreq, gainValue, type) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  /** One short tone that slides from `from` to `to` hertz. */
  function tone(from, to, duration, gainValue, type, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (muted) {
        this.stopEngine();
        this.stopSiren();
      }
    },
    isMuted() {
      return muted;
    },

    /** Start the engine hum; call every frame with speed 0..1 and throttle 0..1. */
    engine(speed, throttle) {
      if (!ctx || muted) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc2 = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc2.type = 'square';
        engineOsc.frequency.value = 60;
        engineOsc2.frequency.value = 30;
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        engineOsc2.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(ctx.destination);
        engineOsc.start();
        engineOsc2.start();
      }
      const target = throttle > 0 || speed > 0.05 ? 0.05 + speed * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed * 190 + throttle * 30, ctx.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(28 + speed * 95, ctx.currentTime, 0.06);
    },

    stopEngine() {
      if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    },

    /** The two-tone siren, stepped by the caller each frame while police are near. */
    siren(dt, active) {
      if (!ctx || muted || !active) {
        this.stopSiren();
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 720;
        sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        sirenOsc.start();
      }
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 950 : 700, ctx.currentTime);
      }
    },

    stopSiren() {
      if (sirenOsc) {
        try { sirenOsc.stop(); } catch { /* already stopped */ }
        sirenOsc = null;
        sirenGain = null;
      }
    },

    shoot() {
      noiseBurst(0.14, 1800, 0.5, 'highpass');
      tone(180, 60, 0.12, 0.25, 'square');
    },

    punch() {
      noiseBurst(0.09, 300, 0.4, 'lowpass');
    },

    crash() {
      noiseBurst(0.3, 500, 0.5, 'lowpass');
    },

    pickup() {
      tone(880, 1320, 0.12, 0.2, 'sine');
    },

    click() {
      tone(660, 660, 0.05, 0.12, 'square');
    },

    /** Four rising notes when a mission pays out. */
    jingle() {
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i += 1) tone(notes[i], notes[i], 0.22, 0.18, 'triangle', i * 0.11);
    },

    /** A low two-note sting when the heat rises. */
    sting() {
      tone(220, 220, 0.25, 0.2, 'sawtooth');
      tone(175, 175, 0.35, 0.2, 'sawtooth', 0.22);
    },

    /** A sad fall when Lena is busted or wasted. */
    fail() {
      tone(392, 392, 0.3, 0.2, 'triangle');
      tone(311, 233, 0.6, 0.2, 'triangle', 0.28);
    },
  };
}
