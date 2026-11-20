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
  // Procedural car radio: four stations, all synthesized, no audio files.
  const radio = { on: false, station: 0, nextTime: 0, step: 0 };
  const radioGainNode = { node: null };

  /** The four stations: name, tempo, and the note tables the scheduler walks. */
  const STATIONS = [
    {
      name: 'COSTA SYNTHWAVE',
      bpm: 116,
      bass: [55, 55, 65.41, 49],
      lead: [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63],
    },
    {
      name: 'HARBOR LO-FI',
      bpm: 72,
      bass: [110, 87.31, 130.81, 98],
      lead: [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196],
    },
    {
      name: 'POLICE SCANNER',
      bpm: 90,
      bass: [0, 0, 0, 0],
      lead: [880, 0, 1174.66, 0, 988, 0, 0, 1318.51],
    },
    {
      name: 'SUNSET DRIVE',
      bpm: 96,
      bass: [82.41, 82.41, 98, 73.42],
      lead: [329.63, 392, 493.88, 587.33, 493.88, 392, 329.63, 261.63],
    },
  ];

  /** One-line description of a station, for the radio banner's second line. */
  function stationBlurb(index) {
    if (index === 0) return 'synthwave for the avenues';
    if (index === 1) return 'slow grooves from the harbour';
    if (index === 2) return 'dispatch chatter and static';
    return 'golden-hour guitar for the coast road';
  }

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
    toneAt(from, to, duration, gainValue, type, t0);
  }

  /** The same tone, scheduled at an absolute context time (radio scheduler). */
  function toneAt(from, to, duration, gainValue, type, t0) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    const dest = ctx.destination;
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** A radio note through the radio's own quiet gain bus (stations stay soft
   * under the engine and the sirens). */
  function radioNote(freq, t0, duration, gainValue, type) {
    if (!ctx || muted || !radioGainNode.node) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(radioGainNode.node);
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
        this.radioStop();
      }
    },
    isMuted() {
      return muted;
    },

    /** Radio station names, for the HUD banner. */
    radioStations() {
      return STATIONS.map((s) => s.name);
    },
    radioStation() {
      return radio.station;
    },
    /** The current station's one-line blurb, for the radio banner. */
    radioBlurb() {
      return stationBlurb(radio.station);
    },
    radioIsOn() {
      return radio.on;
    },

    /** Start the radio on `station` (0..2): auto-plays when Lena gets in a car. */
    radioStart(station) {
      if (!ctx || muted) return;
      if (!radioGainNode.node) {
        radioGainNode.node = ctx.createGain();
        radioGainNode.node.gain.value = 0.5;
        radioGainNode.node.connect(ctx.destination);
      }
      radio.station = ((station || 0) % STATIONS.length + STATIONS.length) % STATIONS.length;
      radio.on = true;
      radio.step = 0;
      radio.nextTime = ctx.currentTime + 0.05;
    },

    /** Next station; returns its name for the banner. */
    radioCycle() {
      this.radioStart(radio.station + 1);
      return STATIONS[radio.station].name;
    },

    radioStop() {
      radio.on = false;
    },

    /**
     * Schedule radio notes a little ahead of the playhead. Call every frame
     * while driving: each step is one eighth-note of the station's tempo, the
     * bass walks its four-note loop and the lead arpeggiates over it. The
     * scanner station plays sparse blips with static bursts instead of music.
     */
    radioTick() {
      if (!ctx || muted || !radio.on) return;
      const st = STATIONS[radio.station];
      const stepDur = 60 / st.bpm / 2;
      while (radio.nextTime < ctx.currentTime + 0.18) {
        const t = radio.nextTime;
        const s = radio.step;
        const bass = st.bass[s % st.bass.length];
        const lead = st.lead[s % st.lead.length];
        if (radio.station === 2) {
          if (lead > 0 && s % 2 === 0) radioNote(lead, t, 0.09, 0.05, 'square');
          if (s % 8 === 6) noiseBurst(0.12, 2400, 0.03, 'bandpass');
        } else {
          if (bass > 0 && s % 2 === 0) radioNote(bass, t, stepDur * 1.8, 0.09, 'sawtooth');
          if (lead > 0) radioNote(lead, t, stepDur * 0.9, 0.045, radio.station === 0 ? 'square' : radio.station === 3 ? 'sine' : 'triangle');
          if (radio.station === 1 && s % 4 === 0) radioNote(lead / 2, t, stepDur * 3.5, 0.05, 'sine');
          // SUNSET DRIVE answers its lead an octave down, every fourth step:
          // a slow golden-hour harmony under the guitar line.
          if (radio.station === 3 && s % 4 === 2) radioNote(lead / 2, t, stepDur * 2, 0.04, 'sine');
        }
        radio.step += 1;
        radio.nextTime += stepDur;
      }
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

    /** Two bright coin notes when side work pays: a fare, a package, a jump. */
    cash() {
      tone(1320, 1320, 0.09, 0.16, 'sine');
      tone(1760, 1760, 0.14, 0.16, 'sine', 0.08);
    },

    /** A rising noise sweep for a stunt jump: wind, then a landing thump. */
    jumpWhoosh() {
      noiseBurst(0.35, 900, 0.22, 'bandpass');
      tone(180, 420, 0.3, 0.1, 'sine');
      tone(90, 60, 0.18, 0.25, 'sine', 0.3);
    },

    /** Two-tone cab blip when a fare climbs aboard. */
    taxiBlip() {
      tone(988, 988, 0.09, 0.16, 'square');
      tone(1319, 1319, 0.12, 0.16, 'square', 0.1);
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
