// Sound effects, made in the browser (Web Audio): short NES-flavoured blips for the menus and noise / sweep bursts for the weapons and
// explosions. Nothing is loaded from a file. The audio context wakes up on the first click or key press (browsers keep it silent till then).
// sfx.follow(vector): the point explosions are heard from (the middle of the screen, the camera focus, or the jeep before there is one): far ones are quieter.
const choppers = new Map(); let chopperWatch = 0, trainSnd = null, trainRec = null, trainSirenBuf = null, carriageBuf = null; const hornSrcs = new Set();
import explosionUrl from '../sound/explosion.mp3';
import cannonUrl from '../sound/cannon.mp3';
import trainSirenUrl from '../sound/train_siren.mp3'; // (the locomotive's horn)
import carriageUrl from '../sound/carriage_sound.mp3'; // (the carriages rolling: looped while the train runs)
import sirenUrl from '../sound/siren.mp3'; // (the arena's alarm: only the first 3 s of it are played)
import cannon2Url from '../sound/cannon2.mp3'; // (the heavy shells: the medium tank's and the stage 1 boss tanks') // (a recorded cannon: static turrets and tanks)
import flameUrl from '../sound/flame.mp3'; // (the flame tank's burning jet: only the first second or so of it is played)
import thunder1Url from '../sound/thunder1.mp3'; import thunder2Url from '../sound/thunder2.mp3'; import thunder3Url from '../sound/thunder3.mp3'; import thunder4Url from '../sound/thunder4.mp3'; import thunder5Url from '../sound/thunder5.mp3'; // (recorded thunder claps for the storm: stage 6's lightning)
import snowfieldUrl from '../sound/snowfield.mp3'; // (the secret level's music: streamed, not decoded, it is five megabytes)
import bigExplosionUrl from '../sound/explosions2.mp3'; // (the heavier one: a building, such as a prisoners' hut, brought down) // (a recorded explosion; the synthesized one below is the fallback until it has loaded)
let duck = null, thunderBus = null, thunderBufs = [], lastThunder = -1, flameBuf = null, sirenBuf = null, sirenFrom = 0, cannon2Buf = null, cannonBuf = null, lastSmall = null, boomBuf = null, bigBuf = null, centre = null, lastMissile = 0, lastShot = 0, lastCannon = 0;
let ctx = null, master = null, boomBus = null, windN = null, eng = null, noise = null, listener = null, lastBoom = 0, booms = 0;
// How much of its volume a sound keeps `d` metres from the jeep: all of it beside it, dying away to nothing at `reach`.
const fall = (at, reach, curve = 1.6, from = centre ?? listener) => from && at ? Math.pow(Math.max(0, 1 - Math.hypot(at.x - from.x, at.z - from.z) / reach), curve) : 1;
const VOL_KEY = 'jackal-volume', MUSIC_VOL_KEY = 'jackal-music-volume';
let vol = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return v >= 0 && v <= 1 ? v : .6; } catch { return .6; } })(); // (the settings slider, 0..1: 60% until the player moves it)
let musicVol = (() => { try { const v = parseFloat(localStorage.getItem(MUSIC_VOL_KEY)); return v >= 0 && v <= 1 ? v : .85; } catch { return .85; } })(); // (the music's own slider, 0..1: 85% until the player moves it)
const W = .72; // the jeep's own weapons (gun, grenade, rocket) a little under the rest
const level = v => v * v * v; // the slider's steps are felt, not measured: cubed, so half way is an eighth of the gain (how loudness is heard)
const MASTER = 1.1, QUIET_BEYOND = 22, MUSIC_K = 2.34375; // MUSIC_K: the music's loudness against the effects, at the same slider setting
import jackalUrl from '../sound/bgm_jackal.mp3'; import requiemUrl from '../sound/bgm_requiem.mp3'; import middleUrl from '../sound/bgm_middle.mp3'; import bossUrl from '../sound/bgm_boss.mp3'; import finalBossUrl from '../sound/bgm_finalboss.mp3'; // (stages 1/4, 2/5, 3/6, every boss fight, and stage 6's final boss)
import clearUrl from '../sound/bgm_clear.mp3'; // (the stage-clear jingle: played once)
import gameOverUrl from '../sound/bgm_gameover.mp3'; // (the game-over jingle: played once)
import startUrl from '../sound/bgm_start.mp3'; // (the game-start jingle: stage 1's opening, played once)
const MUSICS = { start: startUrl, gameover: gameOverUrl, clear: clearUrl, snowfield: snowfieldUrl, jackal: jackalUrl, requiem: requiemUrl, middle: middleUrl, boss: bossUrl, finalBoss: finalBossUrl };
let endedName = null, musicEl = null, musicGain = null, musicName = null; // explosions further than this from the listener fade

function wake() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const tw0 = performance.now(); try { ctx = new AC(); } catch { return; }
    setTimeout(() => console.log('AUDIO context created and set up in ' + (performance.now() - tw0).toFixed(0) + ' ms (this blocks the page: a hitch if it happens during play)'), 0);
    master = ctx.createGain(); master.gain.value = MASTER * level(vol);
    // a little saturation for bite, then a compressor that glues the hits together and keeps many at once from clipping
    const sat = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); }
    sat.curve = curve; sat.oversample = '2x';
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 5; lim.attack.value = .002; lim.release.value = .12;
    duck = ctx.createGain(); master.connect(duck); duck.connect(sat); sat.connect(lim); lim.connect(ctx.destination); // (duck: everything else dips while the thunder rolls)
    thunderBus = ctx.createGain(); thunderBus.gain.value = MASTER * level(vol); thunderBus.connect(ctx.destination); // (the thunder has the right of way: its own line to the output, past the saturation and the compressor that the other sounds squeeze each other through)
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // explosions go through a bus that also feeds a reverb (a generated impulse: noise that dies away, darker as it goes), so they boom and echo off the distance
    boomBus = ctx.createGain(); boomBus.connect(master);
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const a = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const k = i / len; lp += (Math.random() * 2 - 1 - lp) * (.6 - .5 * k); a[i] = lp * Math.pow(1 - k, 3); } }
    const verb = ctx.createConvolver(), wet = ctx.createGain(); verb.buffer = ir; wet.gain.value = .2; boomBus.connect(verb); verb.connect(wet); wet.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (boomBuf === null) { // load the recorded explosion once, now that there is a context to decode it
    boomBuf = false;
    fetch(explosionUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { boomBuf = b; }).catch(() => { boomBuf = false; });
    fetch(sirenUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { // (and where it really starts: past any silence at the front)
      const d = b.getChannelData(0); let i = 0; while (i < d.length && Math.abs(d[i]) < .02) i++;
      sirenFrom = Math.max(0, i / b.sampleRate - .02); sirenBuf = b;
    }).catch(() => { sirenBuf = false; });
    fetch(trainSirenUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { trainSirenBuf = b; }).catch(() => { trainSirenBuf = false; });
    fetch(carriageUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { carriageBuf = b; }).catch(() => { carriageBuf = false; });
    fetch(flameUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { flameBuf = b; }).catch(() => { flameBuf = false; });
    fetch(cannon2Url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { cannon2Buf = b; }).catch(() => { cannon2Buf = false; });
    fetch(cannonUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { cannonBuf = b; }).catch(() => { cannonBuf = false; });
    [thunder1Url, thunder2Url, thunder3Url, thunder4Url, thunder5Url].forEach((u, i) => fetch(u).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { thunderBufs[i] = b; }).catch(() => {}));
    fetch(bigExplosionUrl).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { bigBuf = b; }).catch(() => { bigBuf = false; });
  }
  return ctx.state === 'running' ? ctx : null;
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });

// A tone that glides from f0 to f1 over `dur` s, with a fast attack and an exponential fade.
function tone(type, f0, f1, dur, vol, when = 0, out = master) {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
}
// A burst of noise through a filter whose cutoff glides from f0 to f1.
function hiss(type, f0, f1, dur, vol, when = 0, q = 1, attack = .004, out = master) {
  const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + .02);
}

// Each looping track's file ends in a fade-out (about nine seconds of it), so looping the file as it is leaves a long quiet gap before it starts again. LOOP_AT is where each fade begins (found by measuring them):
// there the next play of the track is started from the top and blended in over XFADE seconds while the old one carries on into its fade, so the music never drops out.
const LOOP_AT = { jackal: 82.2, requiem: 177.4, middle: 67.8, boss: 74.0, finalBoss: 79.1, snowfield: 68.5 }, XFADE = 2.5, ONCE = new Set(['clear', 'gameover', 'start']);
function startTrack(c, name, fadeIn) { // one playing copy of a track, through its own gain and the limiter; the one in `musicEl` / `musicGain` is the current one
  const el = new Audio(MUSICS[name]); el.preload = 'auto'; el.loop = false;
  let g; try { const src = c.createMediaElementSource(el); g = c.createGain(); g.gain.value = 0; const lim = c.createDynamicsCompressor(); lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .003; lim.release.value = .12; src.connect(g); g.connect(lim); lim.connect(c.destination); } catch { return null; } // (a limiter at the end, so the louder music cannot clip)
  const once = ONCE.has(name), full = () => MUSIC_K * level(musicVol);
  el.addEventListener('ended', () => { if (once) { if (musicName === name) endedName = name; } else if (musicEl === el) { try { el.currentTime = 0; el.play(); } catch {} } }); // (a track with no fade point set just restarts)
  el.play().then(() => { g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(full(), c.currentTime + (fadeIn ? (once ? .05 : 3) : XFADE)); }).catch(() => { if (musicEl === el) { musicName = null; musicEl = null; musicGain = null; } });
  const at = LOOP_AT[name];
  if (!once && at) { const timer = setInterval(() => {
    if (musicEl !== el) { clearInterval(timer); return; }
    if (el.currentTime < at) return;
    clearInterval(timer);
    const n = startTrack(c, name, false); if (!n) return; // (the next play comes in as this one, already fading, goes out)
    musicEl = n.el; musicGain = n.g; g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + XFADE); setTimeout(() => el.pause(), XFADE * 1000 + 200);
  }, 40); }
  return { el, g };
}
export const sfx = {
  // A sonar ping: a clear, soft tone around 1.4 kHz with a quiet overtone, then two fainter echoes a moment apart, through the same reverb as the booms. vol 0..1 (about .3 is a ping heard at some distance).
  ping(vol = .3) {
    if (!ctx || ctx.state !== 'running') return;
    const out = boomBus ?? master;
    tone('sine', 1500, 1400, 1.7, vol, 0, out); tone('sine', 3000, 2800, .9, vol * .16, 0, out);
    tone('sine', 1500, 1400, 1.4, vol * .4, .36, out); tone('sine', 1500, 1400, 1.2, vol * .18, .74, out);
  },
  // Background music: a looping track (a key of MUSICS), faded in over 3 s, on the volume slider with the effects. Returns true once it is playing; the browser lets no sound start before the page has had a click or key, so call it
  // again (each frame is fine) until it says so.
  playMusic(name) {
    if (musicName === name) return true;
    endedName = null;
    if (musicName) this.stopMusic(1); // (another track is playing: fade it out first)
    const c = wake(); if (!c || !MUSICS[name]) return false;
    const t = startTrack(c, name, true); if (!t) return false;
    musicName = name; musicEl = t.el; musicGain = t.g;
    return true;
  },
  musicEnded(name) { return endedName === name; }, // (a one-shot track has played to its end)
  stopMusic(fade = 1.5) {
    if (!musicEl || !ctx) return; const el = musicEl, g = musicGain; musicName = null; musicEl = null; musicGain = null;
    g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade); setTimeout(() => el.pause(), fade * 1000 + 100);
  },
  prime() { wake(); }, get running() { return !!ctx && ctx.state === 'running'; }, // (the browser lets sound start only after a click or key: main.js asks, at the end of loading, whether it has)
  state() { return ctx ? ctx.state + (musicName ? ', music ' + musicName : '') : 'no context yet'; },   // (for the hitch log in main.js)
  get volume() { return vol; },
  setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = MASTER * level(vol); if (thunderBus) thunderBus.gain.value = MASTER * level(vol); try { localStorage.setItem(VOL_KEY, String(vol)); } catch {} },
  get musicVolume() { return musicVol; },
  setMusicVolume(v) { musicVol = Math.max(0, Math.min(1, v)); if (musicGain && musicEl) { musicGain.gain.cancelScheduledValues(0); musicGain.gain.value = MUSIC_K * level(musicVol); } try { localStorage.setItem(MUSIC_VOL_KEY, String(musicVol)); } catch {} },
  follow(v) { listener = v; },
  screen(v) { centre = v; }, // the middle of the screen (the camera's focus): helicopters fade with their distance from it

  // ---- menus
  menuMove() { if (wake()) tone('square', 660, 660, .05, .3); },
  menuSelect() { if (wake()) { tone('square', 523, 523, .06, .32); tone('square', 784, 784, .1, .32, .06); } },
  menuBack() { if (wake()) { tone('square', 523, 523, .06, .3); tone('square', 349, 349, .1, .3, .06); } },

  // ---- the jeep's weapons
  gun() { // a short crack and a thump; slightly different each shot
    if (!wake()) return; const k = .92 + Math.random() * .16;
    hiss('highpass', 2200 * k, 900, .05, .55 * W, 0, .7, .001); hiss('bandpass', 1400 * k, 500, .09, .45 * W, 0, 1.4, .001); // the crack
    tone('square', 320 * k, 70, .07, .35 * W); tone('sine', 150 * k, 45, .11, .7 * W);                                   // the kick
  },
  grenade() { // a soft thunk and an airy lob
    if (!wake()) return;
    tone('sine', 260, 70, .12, .8 * W); tone('square', 420, 120, .07, .3 * W); hiss('bandpass', 600, 1800, .3, .3 * W, .02, 1.2, .08);
  },
  rocket() { // ignition crack, then a long falling whoosh and rumble
    if (!wake()) return;
    hiss('highpass', 2500, 900, .08, .6 * W, 0, .7, .001); hiss('lowpass', 4000, 350, .9, .7 * W, .01, .8, .04);
    tone('sine', 140, 38, .22, .9 * W); tone('sawtooth', 150, 45, .7, .22 * W);
  },
  enemyShot(at, heavy = false, cannon = false) { // an enemy gun: a dull "thok" with a short crack (a tank's heavy cannon: deeper, with more boom). A volley's shells sound as one shot.
    if (!wake()) return;
    const now = ctx.currentTime; if (now - (heavy ? lastCannon : lastShot) < .05) return; heavy ? lastCannon = now : lastShot = now;
    const v = fall(at, 62, 1.4), r = .92 + Math.random() * .16;
    if (v < .03) return;
    const rec = heavy && cannon2Buf ? cannon2Buf : cannonBuf;
    if (cannon && rec) { // the recording (heavy shells: the second one)
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = rec; src.playbackRate.value = .96 + Math.random() * .08; g.gain.value = Math.min(1.3, fall(at, 60, 1.5, centre ?? listener) * 1.1); // (its own fade by distance from the middle of the screen: it reaches 60 m, so a gun at the very edge of the screen, about 30 m out, is still at about a third of full)
      src.connect(g); g.connect(master); src.start(); return;
    }
    if (heavy) { // a cannon: a long low blast, a deep thump and a rolling tail
      hiss('lowpass', 2200, 140, .38, .95 * v, 0, .8, .001); hiss('highpass', 1800, 600, .04, .3 * v, 0, .7, .0005);
      tone('sine', 105 * r, 26, .42, 1.2 * v); tone('triangle', 60, 24, .5, .5 * v, .01); tone('sawtooth', 170 * r, 45, .18, .3 * v);
    } else { // a gun's report: a low-passed blast with a thump behind it, little top end (no sharp click: that is what makes a pop gun)
      hiss('lowpass', 1900 * r, 160, .2, .8 * v, 0, .8, .001); hiss('bandpass', 500, 150, .25, .3 * v, .01, .7, .002);
      tone('sine', 95 * r, 30, .22, 1.0 * v); tone('sawtooth', 160 * r, 55, .1, .25 * v); hiss('highpass', 2000, 800, .02, .15 * v, 0, .7, .0005);
    }
  },
  enemyMissile(at, vertical = false) { // an enemy missile leaving its launcher: ignition crack, a hissing whoosh and a rumble (a silo launch is longer and heavier, as it climbs)
    if (!wake()) return;
    const now = ctx.currentTime; if (now - lastMissile < .08) return; lastMissile = now;
    const v = fall(at, 48, 1.5), L = vertical ? 1 : .6;
    if (v < .03) return;
    hiss('highpass', 2400, 900, .07, .5 * v, 0, .7, .001);                                                  // the ignition
    hiss('lowpass', 3000, 500, .9 * L + .2, .65 * v, .01, .8, .05); hiss('bandpass', 1400, 400, .7 * L, .25 * v, .03, 1.2, .08); // the rushing exhaust
    tone('sine', 120, 38, .3 * L + .15, .95 * v); tone('sawtooth', 140, 45, .6 * L, .2 * v, .02);              // the push and its rumble
  },
  flameIgnite(at) { // the pilot flares and the fuel catches: a sharp "fwip" of gas and a soft pop
    if (!wake()) return;
    const v = fall(at, 42, 1.5); if (v < .03) return;
    hiss('bandpass', 700, 2600, .2, .45 * v, 0, 1.1, .02); tone('sine', 110, 60, .15, .5 * v, .12);
  },
  flameBurst(at, dur = 1) { // a jet of burning fuel: a thump as it lights, then a roaring, fluttering rush with crackle, tailing off
    if (!wake()) return;
    const v = fall(at, 46, 1.5); if (v < .03) return;
    if (flameBuf) { // the recording: cut to the length of the burst, fading out at its end
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime, end = dur + .25;
      src.buffer = flameBuf; src.playbackRate.value = .97 + Math.random() * .06;
      g.gain.setValueAtTime(Math.min(1.4, v * 1.1), t); g.gain.setValueAtTime(Math.min(1.4, v * 1.1), t + end - .3); g.gain.linearRampToValueAtTime(0, t + end);
      src.connect(g); g.connect(master); src.start(t); src.stop(t + end + .02);
      tone('sine', 95, 38, .3, .6 * v); // (a low thump under it as it lights)
      return;
    }
    tone('sine', 95, 38, .35, 1.0 * v); tone('triangle', 55, 30, dur * .9, .5 * v, .02);                                     // the whump and the low roar
    hiss('lowpass', 1800, 500, dur + .3, .85 * v, .01, .7, .06); hiss('bandpass', 420, 260, dur + .3, .6 * v, .02, .8, .08);  // the rushing flame
    hiss('bandpass', 1500, 900, dur * .9, .22 * v, .05, 1.6, .1);                                                              // hiss on top
    for (let i = 0; i < 16; i++) hiss('highpass', 2200 + Math.random() * 2500, 900, .02 + Math.random() * .03, (.18 + Math.random() * .25) * v, .05 + Math.random() * dur, .8, .0008); // crackle
  },
  // ---- the bomber (stage 2): a propeller drone while it is on screen, a falling whistle for each bomb (the explosions are the ordinary ones)
  plane(at) { // call every frame it flies; fades out by itself when the calls stop
    if (!ctx || ctx.state !== 'running') return;
    let v = choppers.get('plane');
    if (!v) {
      const a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), out = ctx.createGain();
      a.type = b.type = 'sawtooth'; a.frequency.value = 118; b.frequency.value = 121.5; lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3; // (two saws a hair apart: the prop and engine beating)
      lfo.type = 'sine'; lfo.frequency.value = 38; lg.gain.value = .3; trem.gain.value = .7; lfo.connect(lg); lg.connect(trem.gain);                    // (four blades going by: the buzz)
      const hs = ctx.createBufferSource(), hf = ctx.createBiquadFilter(), hg = ctx.createGain(); hs.buffer = noise; hs.loop = true; hf.type = 'bandpass'; hf.frequency.value = 1500; hf.Q.value = .8; hg.gain.value = .15;
      hs.connect(hf); hf.connect(hg); hg.connect(trem);
      a.connect(lp); b.connect(lp); lp.connect(trem); trem.connect(out); out.gain.value = 0; out.connect(master);
      a.start(); b.start(); lfo.start(); hs.start(0, Math.random());
      v = { lfo, out, last: 0 }; choppers.set('plane', v);
      if (!chopperWatch) chopperWatch = setInterval(() => { for (const c of choppers.values()) if (performance.now() - c.last > 250) c.out.gain.setTargetAtTime(0, ctx.currentTime, .15); }, 120);
    }
    v.last = performance.now(); v.out.gain.setTargetAtTime(.5 * fall(at, 80, 1.6, centre ?? listener), ctx.currentTime, .25);
  },
  quad(at) { // a quadcopter drone (stage 4): a thin, high whine; call every frame it flies, it fades out by itself when the calls stop
    if (!ctx || ctx.state !== 'running') return;
    let v = choppers.get('quad');
    if (!v) {
      const a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), out = ctx.createGain();
      a.type = b.type = 'sawtooth'; a.frequency.value = 330; b.frequency.value = 338; lp.type = 'bandpass'; lp.frequency.value = 1100; lp.Q.value = 2.5;
      lfo.type = 'sine'; lfo.frequency.value = 85; lg.gain.value = .35; trem.gain.value = .65; lfo.connect(lg); lg.connect(trem.gain);
      a.connect(lp); b.connect(lp); lp.connect(trem); trem.connect(out); out.gain.value = 0; out.connect(master);
      a.start(); b.start(); lfo.start();
      v = { lfo, out, last: 0 }; choppers.set('quad', v);
      if (!chopperWatch) chopperWatch = setInterval(() => { for (const c of choppers.values()) if (performance.now() - c.last > 250) c.out.gain.setTargetAtTime(0, ctx.currentTime, .15); }, 120);
    }
    v.last = performance.now(); v.out.gain.setTargetAtTime(.3 * fall(at, 45, 1.6, centre ?? listener), ctx.currentTime, .12);
  },
  bombWhistle(at) { // a bomb let go: a thin whistle that drops in pitch as it falls
    if (!wake()) return;
    const v = fall(at, 70, 1.4, centre ?? listener); if (v < .03) return;
    tone('sine', 2300, 650, 1.7, .16 * v); tone('triangle', 1150, 330, 1.7, .05 * v); hiss('bandpass', 2500, 900, 1.5, .05 * v, 0, 4, .3);
  },

  // ---- stage 3's laser maze: a whine that climbs while an emitter warms up, then a hard zap and a crackling hum for as long as the curtain is live
  laserCharge(at, dur = .8) {
    if (!wake()) return; const v = fall(at, 40, 1.5); if (v < .03) return;
    tone('sawtooth', 220, 1700, dur, .13 * v); tone('sine', 440, 3400, dur, .06 * v); hiss('bandpass', 1500, 4500, dur, .05 * v, 0, 3, .25);
  },
  laserOn(at, dur = 1.6) {
    if (!wake()) return; const v = fall(at, 46, 1.5); if (v < .03) return;
    hiss('highpass', 3000, 1200, .09, .55 * v, 0, .7, .0005); tone('sawtooth', 900, 160, .18, .35 * v); tone('sine', 120, 45, .2, .5 * v); // the zap as it fires
    const t = ctx.currentTime, hum = (type, f, vol, q) => { // the hum: held, then cut short at the end
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = q;
      lfo.type = 'square'; lfo.frequency.value = 100 + Math.random() * 30; lg.gain.value = vol * .35; lfo.connect(lg); lg.connect(g.gain); // (the buzz: 100 Hz mains-like flutter)
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * .65, t + .06); g.gain.setValueAtTime(vol * .65, t + dur - .15); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(lp); lp.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + dur + .02); lfo.stop(t + dur + .02);
    };
    hum('sawtooth', 110, .22 * v, 4); hum('square', 221, .1 * v, 2);
    hiss('bandpass', 2600, 2200, dur, .12 * v, .05, 2, .08);                                                                                // the crackle riding on it
    for (let i = 0; i < 10; i++) hiss('bandpass', 2000 + Math.random() * 4000, 1500, .015, .2 * v, .1 + Math.random() * (dur - .2), 3, .0005); // and a few snaps
  },

  // ---- the airbase (airbase-boss.js)
  fieldDown(at, dur = 2.3) { // the energy field's power fails: a whine falling in pitch over a stuttering hum, static that thins, snaps and crackles all through it, and a low thud and rush as it goes out
    if (!wake()) return; const v = fall(at, 70, 1.3); if (v < .02) return;
    tone('sawtooth', 560, 44, dur, .2 * v); tone('square', 281, 28, dur * .92, .09 * v); tone('sine', 1500, 120, dur * .7, .06 * v);
    hiss('bandpass', 3400, 700, dur, .15 * v, 0, 2.5, .15);
    for (let i = 0; i < 24; i++) hiss('bandpass', 1500 + Math.random() * 4500, 900, .02, .24 * v * (1 - i / 34), Math.random() * dur * .95, 3, .0005);
    tone('sine', 95, 28, .55, .6 * v, dur - .05); hiss('lowpass', 1000, 110, .5, .42 * v, dur - .05, .8, .004);
  },
  fieldPulse(at) { // a garage lost: the field stutters (a short dip in pitch and a few snaps)
    if (!wake()) return; const v = fall(at, 60, 1.3); if (v < .02) return;
    tone('sawtooth', 300, 90, .35, .16 * v); hiss('bandpass', 2600, 1200, .3, .1 * v, 0, 2.5, .01);
    for (let i = 0; i < 5; i++) hiss('bandpass', 2000 + Math.random() * 3500, 1200, .018, .22 * v, Math.random() * .3, 3, .0005);
  },
  doorServo(at, dur = 1.5, closing = false) { // a heavy door: the motor's growl and the hiss of the hydraulics, a clank where it stops
    if (!wake()) return; const v = fall(at, 55, 1.5); if (v < .02) return;
    tone('sawtooth', closing ? 62 : 48, closing ? 44 : 70, dur, .16 * v); tone('square', closing ? 124 : 96, closing ? 88 : 140, dur * .9, .05 * v);
    hiss('lowpass', 2200, 500, dur * .8, .22 * v, 0, .7, .08);
    tone('square', 170, 55, .11, .32 * v, dur - .05); tone('sine', 85, 38, .22, .45 * v, dur - .05); hiss('highpass', 3500, 1500, .07, .3 * v, dur - .05, .8, .001); // the clank
  },

  // ---- prisoners running to the evac helicopter
  hop(at) { if (wake()) { const v = fall(at, 50, 1.5); tone('sine', 150, 55, .1, .3 * v); hiss('lowpass', 700, 200, .06, .1 * v); } },  // dropping out of the jeep
  step(at) { if (wake()) hiss('lowpass', 1100 + Math.random() * 500, 300, .04, .14 * fall(at, 40, 1.5), 0, .8, .001); },                  // a footfall
  board(at) { if (wake()) { const v = fall(at, 50, 1.5); tone('square', 660, 660, .05, .07 * v); tone('square', 990, 990, .09, .07 * v, .05); tone('sine', 120, 60, .08, .2 * v); } }, // climbing aboard
  siren(dur = 3) { // the boss arena shuts: the recorded alarm, cut to its first `dur` seconds with a fade at the end (a synthesized wail if it hasn't loaded)
    if (!wake()) return;
    if (sirenBuf) {
      const t = ctx.currentTime, src = ctx.createBufferSource(), g = ctx.createGain(), len = Math.min(dur, sirenBuf.duration - sirenFrom);
      src.buffer = sirenBuf; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.7, t + .05); g.gain.setValueAtTime(.7, t + len - .6); g.gain.linearRampToValueAtTime(0, t + len);
      src.connect(g); g.connect(master); src.start(t, sirenFrom, len);
      return;
    }
    const t = ctx.currentTime, lo = 560, hi = 1000, sweeps = 2, step = dur / (sweeps * 2);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22, t + .06); g.gain.setValueAtTime(.22, t + dur - .3); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const [type, mul, vol] of [['square', 1, .55], ['triangle', 2, .35]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; og.gain.value = vol;
      o.frequency.setValueAtTime(lo * mul, t);
      for (let n = 1; n <= sweeps * 2; n++) o.frequency.linearRampToValueAtTime((n % 2 ? hi : lo) * mul, t + n * step);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + .05);
    }
    lp.connect(g); g.connect(master);
  },
  pow() { // a prisoner picked up: a bright rising arpeggio, with a soft thump as he lands in the jeep
    if (!wake()) return;
    [[523, 0], [659, .07], [784, .14], [1047, .21]].forEach(([f, w], i) => { tone('square', f, f, .12 + (i === 3 ? .12 : 0), .06, w); tone('triangle', f * 2, f * 2, .1, .015, w); });
    tone('sine', 170, 70, .1, .1, .02);
  },
  star() { // a power-up: a fast sparkling run up two octaves that lands on a held, shimmering chord
    if (!wake()) return;
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => { tone('square', f, f, .09, .2, i * .05); tone('triangle', f * 2, f * 2, .08, .06, i * .05); });
    [1047, 1319, 1568, 2093].forEach(f => { tone('square', f, f * 1.01, .55, .13, .36); tone('sine', f * 2, f * 2, .5, .05, .36); }); // (the chord, a hair out of tune: it shimmers)
    tone('sine', 220, 440, .3, .3, .02);                                                                                              // and a rising swell underneath
  },
  crush() { // the jeep runs a foot soldier down: a dull thump, a wet crunch and a few snaps
    if (!wake()) return;
    tone('sine', 120, 40, .16, .9); tone('triangle', 200, 60, .1, .5);
    hiss('lowpass', 1800, 300, .16, .6, 0, .8, .002); hiss('bandpass', 1200, 500, .07, .35, .02, 2, .001);
    for (let i = 0; i < 3; i++) hiss('bandpass', 2000 + Math.random() * 2500, 900, .02, .25, .03 + i * .035 + Math.random() * .02, 3, .001);
  },

  // ---- stage 4's hidden launchers in the mud (mud-launchers.js)
  bubble(at) { // a bubble of marsh gas breaking: a soft, rising bloop
    if (!wake()) return; const v = fall(at, 45, 1.5); if (v < .02) return; const f = 170 + Math.random() * 170;
    tone('sine', f, f * 2.3, .09, .14 * v); hiss('bandpass', 900, 500, .05, .04 * v, .01, 2, .001);
  },
  mudBurst(at) { // the mud thrown up as a missile bursts out of the hole: a wet, heavy splurt
    if (!wake()) return; const v = fall(at, 60, 1.4); if (v < .02) return;
    hiss('lowpass', 900, 110, .6, .6 * v, 0, .8, .01); tone('sine', 95, 34, .5, .55 * v); hiss('bandpass', 400, 160, .35, .3 * v, .02, 1.5, .02);
    for (let i = 0; i < 6; i++) hiss('bandpass', 700 + Math.random() * 900, 300, .05, (.1 + Math.random() * .12) * v, .05 + Math.random() * .35, 3, .002); // (splashes of it falling back)
  },

  // ---- stage 4's boulders (falling-rocks.js). All fade with their distance from the jeep.
  rockCrack(at) { // the warning: stone groaning on its seat, and cracks and grit spilling, over its last second before it goes
    if (!wake()) return; const v = fall(at, 60, 1.5); if (v < .02) return;
    tone('sawtooth', 70, 48, .95, .22 * v); hiss('lowpass', 420, 120, .95, .35 * v, 0, .8, .25); // (the groan: a low scrape that builds)
    for (let i = 0; i < 6; i++) { const w = .08 + i * .14 + Math.random() * .08; hiss('bandpass', 1500 + Math.random() * 2500, 700, .03 + Math.random() * .03, (.18 + i * .05) * v, w, 3, .001); tone('triangle', 240 + Math.random() * 120, 80, .05, .12 * v, w); } // (cracks that come faster and harder)
    for (let i = 0; i < 5; i++) hiss('bandpass', 3000 + Math.random() * 3000, 1800, .02, .1 * v, .2 + Math.random() * .7, 4, .001); // (grit trickling)
  },
  rockFall(at) { // it goes over the edge: a deep, rumbling scrape that carries it down the face
    if (!wake()) return; const v = fall(at, 70, 1.4); if (v < .02) return;
    hiss('lowpass', 520, 70, 2.2, .75 * v, 0, .7, .08); tone('sine', 62, 30, 1.6, .5 * v);
    for (let i = 0; i < 12; i++) { const w = .05 + Math.random() * 1.6, f = 800 + Math.random() * 2400; hiss('bandpass', f, f * .5, .03 + Math.random() * .04, (.1 + Math.random() * .16) * v, w, 2.5, .001); } // (stones kicked loose, clattering after it)
  },
  thunder(when = 0, size = 1) { // a crack, then a long rolling rumble that swells and fades, with a deep note under it
    if (!wake()) return;
    const have = thunderBufs.map((b, i) => b ? i : -1).filter(i => i >= 0); // (a recording, a different one from the last time; the synthesized one below only until they have loaded)
    if (have.length) {
      const pool = have.length > 1 ? have.filter(i => i !== lastThunder) : have, i = pool[Math.floor(Math.random() * pool.length)]; lastThunder = i;
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = thunderBufs[i]; src.playbackRate.value = .94 + Math.random() * .12; g.gain.value = .9 * size;
      src.connect(g); g.connect(thunderBus); const t0 = ctx.currentTime + when; src.start(t0);
      const dur = src.buffer.duration / src.playbackRate.value; // (priority: the rest of the mix dips to 35% under it, quickly, and comes back as it dies away)
      duck.gain.cancelScheduledValues(t0 - .05); duck.gain.setTargetAtTime(.35, Math.max(ctx.currentTime, t0 - .05), .04); duck.gain.setTargetAtTime(1, t0 + dur * .55, .5);
      return;
    }
    hiss('bandpass', 2200, 500, .1, .35 * size, when, 1.4, .002); hiss('lowpass', 900, 140, .5, .5 * size, when, .8, .004);
    hiss('lowpass', 380, 55, 3.4 * size, .8 * size, when + .12, .7, .35); tone('sine', 52, 26, 3 * size, .55 * size, when + .1);
    for (let i = 0; i < 4; i++) hiss('lowpass', 300 + i * 40, 60, 1.2, .3 * size, when + .5 + i * .5 + Math.random() * .3, .8, .25); // (the rolling: swells coming back off the hills)
  },
  rockThud(at, speed = 6) { // it lands or bounces: a heavy thud (harder, the faster it was going) with a crunch of gravel
    if (!wake()) return; const v = fall(at, 65, 1.4) * Math.min(1.2, .35 + speed / 12); if (v < .02) return;
    tone('sine', 120, 32, .3, .95 * v); tone('triangle', 70, 26, .35, .55 * v, .01); hiss('lowpass', 900, 120, .28, .6 * v, 0, .8, .002);
    for (let i = 0, n = 2 + Math.round(speed / 4); i < n; i++) hiss('bandpass', 1400 + Math.random() * 2200, 600, .03, (.14 + Math.random() * .12) * v, .02 + Math.random() * .12, 3, .001);
  },
  rockRoll(at, speed = 6) { // call every ~0.14 s while it rolls: a low, grinding rumble that follows its speed
    if (!wake()) return; const v = fall(at, 55, 1.4) * Math.min(1, speed / 10); if (v < .02) return;
    hiss('lowpass', 260 + speed * 18, 90, .2, .42 * v, 0, .8, .03); tone('sine', 48 + speed * 2.5, 38, .2, .22 * v);
    if (Math.random() < .5) hiss('bandpass', 1100 + Math.random() * 1800, 500, .025, .1 * v, Math.random() * .1, 3, .001); // (a pebble crushed under it)
  },
  rockSmash(at) { // shot to pieces: stone cracking apart and the pieces knocking down (all noise, no pitched thump: a falling sine reads as a balloon bursting)
    if (!wake()) return; const v = fall(at, 65, 1.4); if (v < .02) return;
    hiss('lowpass', 700, 130, .7, .55 * v, 0, .8, .02); // (a low crunch under it all, coming up slowly)
    for (let i = 0; i < 46; i++) { // hard stone knocking on stone: short, resonant clacks at many pitches, thick at first, then thinning out
      const d = Math.pow(Math.random(), 2.2) * 1.3, f = 500 + Math.random() * 3000, k = 1 - d / 1.6;
      hiss('bandpass', f, f * (.7 + Math.random() * .3), .018 + Math.random() * .04, (.16 + Math.random() * .22) * v * k, d, 7 + Math.random() * 5, .001);
    }
    for (let i = 0; i < 10; i++) hiss('highpass', 2500, 2500, .03, (.05 + Math.random() * .06) * v, Math.random() * .6, .7, .001); // (gravel)
    hiss('lowpass', 380, 80, .9, .3 * v, .15, .7, .15); // (rubble settling)
  },


  // ---- the wind on the mountain: rushing noise that gets louder, higher and gustier as the wind rises. Call every frame: k 0..1 (0: none).
  wind(k) {
    if (!ctx || ctx.state !== 'running') return;
    if (!windN) {
      const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
      src.buffer = noise; src.loop = true; bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = .7; g.gain.value = 0;
      lfo.type = 'sine'; lfo.frequency.value = .13; lg.gain.value = 0; lfo.connect(lg); lg.connect(g.gain); // (slow gusts: the level swells and falls)
      lfo2.type = 'sine'; lfo2.frequency.value = .31; lg2.gain.value = 0; lfo2.connect(lg2); lg2.connect(bp.frequency); // (and the pitch of the rush wanders with them)
      src.connect(bp); bp.connect(g); g.connect(master); src.start(); lfo.start(); lfo2.start();
      windN = { g, bp, lg, lg2 };
    }
    const t = ctx.currentTime, w = Math.min(1, Math.max(0, k));
    windN.g.gain.setTargetAtTime(w * .075, t, .4); windN.bp.frequency.setTargetAtTime(330 + 520 * w, t, .5); windN.lg.gain.setTargetAtTime(w * .035, t, .5); windN.lg2.gain.setTargetAtTime(w * 140, t, .5);
  },

  // ---- the jeep's engine: a low, throbbing hum that rises with its speed. Call every frame: speed 0..1 (of full speed), on false when it is off (dead, paused, game over).
  engine(speed, on) {
    if (!ctx || ctx.state !== 'running') return;
    if (!eng) {
      const saw = ctx.createOscillator(), sq = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), trem = ctx.createGain();
      saw.type = 'sawtooth'; sq.type = 'square'; lp.type = 'lowpass'; lp.Q.value = 2.5; g.gain.value = 0;
      lfo.type = 'sine'; lg.gain.value = .35; trem.gain.value = .65; // (the throb: the level wobbles about a third)
      lfo.connect(lg); lg.connect(trem.gain);
      const mix = ctx.createGain(); mix.gain.value = .5;
      saw.connect(lp); sq.connect(mix); mix.connect(lp); lp.connect(trem); trem.connect(g); g.connect(master);
      saw.start(); sq.start(); lfo.start();
      eng = { saw, sq, lp, g, lfo };
    }
    const t = ctx.currentTime, k = Math.min(1, Math.max(0, speed));
    eng.saw.frequency.setTargetAtTime(48 + 46 * k, t, .12); eng.sq.frequency.setTargetAtTime(24.5 + 23 * k, t, .12); // (an octave under the saw, a hair off it)
    eng.lfo.frequency.setTargetAtTime(11 + 14 * k, t, .12);
    eng.lp.frequency.setTargetAtTime(260 + 520 * k, t, .12);
    eng.g.gain.setTargetAtTime(on ? .03 + .025 * k : 0, t, on ? .15 : .08);
  },

  // ---- a helicopter: the thump of its blades (`beat` blade passes a second) over a low drone. Call every frame it is in the air or running; it fades out by itself when the calls stop.
  // key: which helicopter; at: where it is (louder nearer the middle of the screen); heavy: the big twin-rotor transport (deeper, louder).
  chopper(key, at, beat = 12, heavy = false, power = 1, reach = 55) { // reach: how far from the middle of the screen it can still be heard (the secret level's fly-in lets it be heard from further) // power 0..1: 0 idling on the ground, 1 flying or lifting off (harder blades: louder, faster, sharper)
    if (!ctx || ctx.state !== 'running') return;
    let v = choppers.get(key);
    if (!v) {
      const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), body = ctx.createGain(), drone = ctx.createOscillator(), dg = ctx.createGain(),
        lfo = ctx.createOscillator(), shape = ctx.createBiquadFilter(), lg = ctx.createGain(), thump = ctx.createGain(), out = ctx.createGain();
      src.buffer = noise; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = heavy ? 170 : 260; lp.Q.value = 1.2; body.gain.value = 1;
      drone.type = 'sawtooth'; drone.frequency.value = heavy ? 52 : 70; dg.gain.value = .22;
      lfo.type = 'square'; shape.type = 'lowpass'; shape.frequency.value = 70; lg.gain.value = .5; thump.gain.value = .5; // the blades: soft pulses that open and shut the sound
      lfo.connect(shape); shape.connect(lg); lg.connect(thump.gain);
      src.connect(lp); lp.connect(body); drone.connect(dg); dg.connect(body); body.connect(thump); thump.connect(out); out.gain.value = 0; out.connect(master);
      src.start(0, Math.random()); drone.start(); lfo.start();
      v = { lfo, out, lp, dg, last: 0, base: heavy ? 170 : 260 }; choppers.set(key, v);
      if (!chopperWatch) chopperWatch = setInterval(() => { // (silence any that has stopped being called: gone, or the game is paused)
        for (const c of choppers.values()) if (performance.now() - c.last > 250) c.out.gain.setTargetAtTime(0, ctx.currentTime, .15);
      }, 120);
    }
    const t = ctx.currentTime, c = centre ?? listener, d = c ? Math.hypot(at.x - c.x, at.z - c.z) : 0, near = Math.pow(Math.max(0, 1 - d / reach), 1.8); // full at the middle of the screen, dying away smoothly to nothing at `reach` (55 m)
    const p = Math.min(1, Math.max(0, power));
    v.last = performance.now(); v.lfo.frequency.setTargetAtTime(beat * (1 + .18 * p), t, .15);                  // the blades bite faster,
    v.lp.frequency.setTargetAtTime(v.base * (1 + 2.6 * p), t, .15); v.dg.gain.setTargetAtTime(.18 + .4 * p, t, .15); // sharper, with a heavier drone under them,
    v.out.gain.setTargetAtTime((heavy ? .45 : .55) * (.5 + .9 * p) * near, t, .25);                      // and much louder than when idling
  },

  // ---- the train (stage 4): a diesel's throb, a low rumble and the clatter of the wheels over the rail joints, louder with its speed (0..1) and nearer; `at` is the point of the train nearest the
  // jeep. Call every frame it is running; it fades out by itself when the calls stop. It can be heard from far off (about 110 m), as a warning.
  train(at, speed = 1, level = 1) { // level: 0..1 on top of the distance (the TrainRide eases it down once the train is inside the tunnel)
    if (!ctx || ctx.state !== 'running') return;
    if (carriageBuf) { // the recording: looped while the train runs, louder nearer and a little faster as it speeds up; it fades out by itself when the calls stop
      if (!trainRec) {
        const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = carriageBuf; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(master); src.start();
        const r = trainRec = { src, g, last: 0 };
        r.watch = setInterval(() => { const age = performance.now() - r.last; if (age > 250) g.gain.setTargetAtTime(0, ctx.currentTime, .2); if (age > 2500) { clearInterval(r.watch); try { src.stop(); } catch {} if (trainRec === r) trainRec = null; } }, 120);
      }
      const t = ctx.currentTime, c = centre ?? listener, d = c ? Math.hypot(at.x - c.x, at.z - c.z) : 0, near = Math.pow(Math.max(0, 1 - d / 110), 1.5), sp = Math.min(1, Math.max(0, speed));
      trainRec.last = performance.now(); trainRec.src.playbackRate.setTargetAtTime(.9 + .15 * sp, t, .3); trainRec.g.gain.setTargetAtTime(1.0 * (.45 + .55 * sp) * near * level, t, .3);
      return;
    }
    let v = trainSnd;
    if (!v) {
      const mk = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random()); return s; };
      const out = ctx.createGain(), low = ctx.createBiquadFilter(), lowG = ctx.createGain(), eng = ctx.createOscillator(), eng2 = ctx.createOscillator(), engG = ctx.createGain(), pulse = ctx.createOscillator(), pulseG = ctx.createGain(),
        clack = ctx.createBiquadFilter(), clackG = ctx.createGain(), rail = ctx.createOscillator(), railS = ctx.createBiquadFilter(), railG = ctx.createGain();
      out.gain.value = 0; out.connect(master);
      const n1 = mk(); low.type = 'lowpass'; low.frequency.value = 150; low.Q.value = .9; lowG.gain.value = .9; n1.connect(low); low.connect(lowG); lowG.connect(out);                  // the low rumble of the whole train
      eng.type = 'sawtooth'; eng.frequency.value = 44; eng2.type = 'square'; eng2.frequency.value = 88; engG.gain.value = .2; pulse.type = 'sine'; pulse.frequency.value = 11; pulseG.gain.value = .12; // a diesel: cylinders firing
      pulse.connect(pulseG); pulseG.connect(engG.gain); eng.connect(engG); eng2.connect(engG); engG.connect(out); eng.start(); eng2.start(); pulse.start();
      const n2 = mk(); clack.type = 'bandpass'; clack.frequency.value = 1300; clack.Q.value = 1.1; clackG.gain.value = 0; n2.connect(clack); clack.connect(clackG); clackG.connect(out);          // the wheels clattering:
      rail.type = 'square'; rail.frequency.value = 12; railS.type = 'lowpass'; railS.frequency.value = 55; railG.gain.value = .5; rail.connect(railS); railS.connect(railG); railG.connect(clackG.gain); rail.start(); // noise opened and shut at the rate the joints pass
      v = trainSnd = { out, rail, eng, eng2, pulse, low, clack, last: 0 };
      setInterval(() => { if (performance.now() - v.last > 250) v.out.gain.setTargetAtTime(0, ctx.currentTime, .2); }, 120);
    }
    const t = ctx.currentTime, c = centre ?? listener, d = c ? Math.hypot(at.x - c.x, at.z - c.z) : 0, near = Math.pow(Math.max(0, 1 - d / 110), 1.5), sp = Math.min(1, Math.max(0, speed));
    v.last = performance.now();
    v.rail.frequency.setTargetAtTime(3 + 11 * sp, t, .2); v.pulse.frequency.setTargetAtTime(6 + 8 * sp, t, .2); v.eng.frequency.setTargetAtTime(38 + 14 * sp, t, .2); v.eng2.frequency.setTargetAtTime(76 + 28 * sp, t, .2);
    v.clack.frequency.setTargetAtTime(900 + 900 * sp, t, .2);
    v.out.gain.setTargetAtTime(.85 * (.4 + .6 * sp) * near * level, t, .3);
  },
  // The train is destroyed: its horn and its rolling and engine noise stop dead (no fade).
  trainStop() {
    for (const h of hornSrcs) { try { h.stop(); } catch {} } hornSrcs.clear();
    if (trainRec) { trainRec.g.gain.cancelScheduledValues(0); trainRec.g.gain.value = 0; trainRec.last = 0; try { trainRec.src.stop(); } catch {} clearInterval(trainRec.watch); trainRec = null; }
    if (trainSnd) { trainSnd.out.gain.cancelScheduledValues(0); trainSnd.out.gain.value = 0; }
  },
  // The train's horn: a hard, dissonant chord (four tones and a deep one under them) in an urgent pattern: a blast, two short, and a long one. `at`: where it sounds (louder nearer).
  trainHorn(at) {
    if (!wake()) return;
    if (trainSirenBuf) { // the recorded locomotive horn
      const g = ctx.createGain(), src = ctx.createBufferSource(), d = fall(at, 170, 1.1); if (d < .02) return;
      src.buffer = trainSirenBuf; g.gain.value = Math.min(2.4, d * 1.8); src.connect(g); g.connect(master); src.start(); hornSrcs.add(src); src.onended = () => hornSrcs.delete(src); return; // (louder: the locomotive's horn is the warning)
    }
    const v = .85 * fall(at, 150, 1.1); if (v < .02) return;
    const now = ctx.currentTime, lp = ctx.createBiquadFilter(), body = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; body.type = 'peaking'; body.frequency.value = 700; body.gain.value = 5; lp.connect(body); body.connect(master);
    for (const [start, dur] of [[0, .85], [1.0, .3], [1.45, .3], [1.9, 1.35]]) {
      for (const [f, type, k] of [[311, 'sawtooth', 1], [370, 'sawtooth', 1], [440, 'sawtooth', .9], [523, 'square', .5], [155, 'sine', 1.1]]) { // (a flattened minor-ish chord: tense, with a deep tone under it)
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = now + start; o.type = type; o.frequency.setValueAtTime(f * .97, t0); o.frequency.linearRampToValueAtTime(f, t0 + .08);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6.5; lg.gain.value = f * .006; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t0); lfo.stop(t0 + dur + .2); // (a slight shake)
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v * .28 * k, t0 + .04); g.gain.setValueAtTime(v * .28 * k, t0 + dur - .05); g.gain.linearRampToValueAtTime(0, t0 + dur + .1);
        o.connect(g); g.connect(lp); o.start(t0); o.stop(t0 + dur + .2);
      }
    }
  },

  // ---- explosions (every one in the game: the jeep's and the enemies'). `size`: the fireball's scale (about .5 to 3); `at`: where, to fade the far ones.
  explosion(size = 1, at, big = false) { // big: a building coming down (the other recording)
    if (!wake()) return;
    const now = ctx.currentTime;
    // (a chain of blasts must not pile up into one roar; but a building's heavy sound arrives a moment after the ordinary blast that hit it: it cuts that one off and takes over)
    if (now - lastBoom < .04 && !(big && bigBuf && lastSmall)) return;
    if (big && bigBuf && lastSmall && now - lastBoom < .12) { lastSmall.cancelScheduledValues(now); lastSmall.setTargetAtTime(0, now, .01); } // (lastSmall is that blast's gain parameter)
    lastBoom = now; lastSmall = null;
    let vol = Math.min(1.4, .55 + .3 * size);
    vol *= fall(at, 48, 1.5); // (the further from the jeep, the quieter)
    if (vol < .03) return;
    const buf = big && bigBuf ? bigBuf : boomBuf;
    if (buf) { // the recording: lower and slower for a big blast, higher and quicker for a small one, a little different each time
      const src = ctx.createBufferSource(), g = ctx.createGain(), dry = Math.min(1.3, vol * 1.1) * (big && bigBuf ? .21 : 1); // (the building's recording is a loud one: held back)
      src.buffer = buf; src.playbackRate.value = (big && bigBuf ? 1 : Math.min(1.2, Math.max(.8, 1.25 - .2 * size))) * (.95 + Math.random() * .1);
      g.gain.value = dry; src.connect(g); g.connect(master); src.start();
      if (!(big && bigBuf)) lastSmall = g.gain;
      return;
    }
    const len = .45 + .35 * size, B = boomBus, v = () => .85 + Math.random() * .3;
    hiss('highpass', 4200, 900, .09, 1.1 * vol, 0, .7, .0004, B); hiss('bandpass', 5500, 2500, .012, .9 * vol, 0, .6, .0003, B);                                                      // 1. the crack: a hard edge on the front
    hiss('bandpass', 2200 * v(), 300, .16, .75 * vol, .002, 1.1, .001, B);                                            //    and the body of the bang
    hiss('lowpass', 6500, 110, len * .85, .9 * vol, 0, .7, .0008, B);                                                      // 2. the blast: a roar whose tone falls away
    tone('sine', 190 * v(), 26, len * .85, 1.15 * vol, 0, B); tone('triangle', 82, 24, len, .5 * vol, .01, B);        // 3. the boom: a sub-bass drop
    tone('sawtooth', 240 * v(), 48, len * .55, .3 * vol, .01, B);                                                    //    and a gritty mid thud
    hiss('lowpass', 260, 55, len * 2.2, .55 * vol, .08, .6, .15, B);                                                 // 4. the rumble: slow to build, long to die
    const grains = 6 + Math.round(5 * Math.min(2, size));                                                           // 5. debris: crackles and pops scattered through the tail
    for (let i = 0; i < grains; i++) {
      const at = .06 + Math.random() * len * 1.4, f = 1200 + Math.random() * 4200;
      hiss('bandpass', f, f * .5, .015 + Math.random() * .035, (.1 + Math.random() * .22) * vol * (1 - at / (len * 1.6)), at, 2 + Math.random() * 3, .001, B);
    }
    if (size > 1.3) hiss('bandpass', 700, 160, .5, .12 * vol, .12 + Math.random() * .1, 1, .01, B);                  // 6. a big one gets a second, softer blast behind the first (the echo)
  },
};

// ---- menu sounds: a tick when the keyboard moves between buttons, a chirp when one is pressed (a "back" button gets the lower one).
let menusOn = false;
export function menuSounds() {
  if (menusOn) return; menusOn = true;
  let lastPointer = -1e9;
  const isMenuButton = el => el instanceof HTMLButtonElement && !el.closest('[class*="touch"], [class^="t-"]');
  addEventListener('pointerdown', () => { lastPointer = performance.now(); }, true);
  addEventListener('focusin', e => { if (isMenuButton(e.target) && performance.now() - lastPointer > 120) sfx.menuMove(); }, true); // (arrows / W / S: a click focuses the button too, but that has its own sound)
  addEventListener('click', e => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!b || !isMenuButton(b)) return;
    b.classList.contains('back') || b.classList.contains('cancel') ? sfx.menuBack() : sfx.menuSelect();
  }, true);
}

// The settings pages' VOLUME sliders (title and pause menus): all of them follow the one level.
export function volumeSliders(root = document) {
  const all = [...root.querySelectorAll('.vol-slider')], music = el => el.dataset.kind === 'music';
  const show = () => all.forEach(el => { el.value = Math.round((music(el) ? sfx.musicVolume : sfx.volume) * 100); el.nextElementSibling.textContent = `${el.value}%`; });
  all.forEach(el => { el.oninput = () => { music(el) ? sfx.setMusicVolume(el.value / 100) : sfx.setVolume(el.value / 100); show(); }; el.onchange = () => sfx.menuMove(); });
  show();
}
