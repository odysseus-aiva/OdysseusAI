'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import type { VoiceState } from '../types';
import type { AudioFrame } from '../hooks/useAudioLevel';
import {
  ORB_STATES,
  ORB_NUMERIC_KEYS,
  DEFAULT_ENTER_RATE,
  type OrbNumericKey,
} from '../orb-states';

// ─── Constants ──────────────────────────────────────────────────────────────
const POINT_SIZE    = 13;
const LOOP_DURATION = 14;
const SPHERE_RADIUS = 2;

// ─── Vertex Shader ───────────────────────────────────────────────────────────
const VERT = /* glsl */ `
  uniform float uTime, uLoopDuration, uNoiseAmp, uSize, uPixelRatio;
  uniform float uRotSpeed, uBreathAmp, uBreathSpeed, uAmpPulse;
  uniform float uConverge, uRipple, uAudio, uRotPhase;
  uniform float uBass, uMid, uTreble;
  attribute float aLayer, aTint, aSize;
  varying float vDepth, vDensity, vTint, vSize;

  vec4 permute(vec4 x){return mod(((x*34.)+1.)*x,289.);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+2.*C.xxx;vec3 x3=x0-D.yyy;
    i=mod(i,289.);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=1./7.;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  vec3 snoiseV(vec3 x){return vec3(snoise(x),snoise(vec3(x.y-19.1,x.z+33.4,x.x+5.2)),snoise(vec3(x.z+74.2,x.x-124.5,x.y+99.4)));}
  vec3 loopedNoise(vec3 p){
    float a=(uTime/uLoopDuration)*6.28318530718;
    return snoiseV(p)*cos(a)+snoiseV(p+vec3(41.13,82.23,113.75))*sin(a);
  }
  vec3 curlNoise(vec3 p){
    const float e=.01;
    vec3 dx=vec3(e,0,0),dy=vec3(0,e,0),dz=vec3(0,0,e);
    vec3 px0=loopedNoise(p-dx),px1=loopedNoise(p+dx);
    vec3 py0=loopedNoise(p-dy),py1=loopedNoise(p+dy);
    vec3 pz0=loopedNoise(p-dz),pz1=loopedNoise(p+dz);
    return vec3((py1.z-py0.z)-(pz1.y-pz0.y),(pz1.x-pz0.x)-(px1.z-px0.z),(px1.y-px0.y)-(py1.x-py0.x))/(2.*e);
  }
  mat3 rotY(float a){float s=sin(a),c=cos(a);return mat3(c,0,-s,0,1,0,s,0,c);}

  void main(){
    vec3 noiseIn=position*.6;
    float pulse=sin(uTime)*0.65+sin(uTime*1.7+1.3)*0.35;
    float amp=uNoiseAmp*(1.+uAmpPulse*pulse);
    // Base surface texture (idle/thinking turbulence — NOT audio-scaled).
    vec3 disp=curlNoise(noiseIn)*amp;

    vec3 nrm=normalize(position);

    // ── Audio → localized surface energy only ──────────────────────────────
    // Every term is a small displacement of individual particles; none scales
    // the whole radius. The sum is hard-clamped to a few % of the base radius
    // so loud input ripples the surface but never inflates the silhouette.
    vec3 aud=vec3(0.0);
    // Fine curl detail: mid formants + treble sibilance rippling the shell.
    float surf=uMid*0.6+uTreble*0.4;
    aud+=curlNoise(noiseIn*1.8+uTime*0.55)*surf*0.42;
    // Travelling latitude wave along the normal, from level + mids.
    float wave=sin(nrm.y*7.0-uTime*4.2)*0.5+sin(nrm.y*11.0-uTime*2.7)*0.5;
    aud+=nrm*wave*(uAudio*0.40+uMid*0.45);
    // Slow bass swell — a gentle pulse through the surface (still local).
    aud+=nrm*uBass*0.22*sin(uTime*2.0);
    // High-frequency shimmer.
    aud+=nrm*sin(nrm.x*38.0+uTime*8.5)*uTreble*0.12;
    // Hard clamp: audio can move a particle at most 14% of the base radius —
    // clearly visible surface energy, but the silhouette still holds.
    float baseLen=length(position);
    float al=length(aud);
    float maxAud=baseLen*0.14;
    if(al>maxAud) aud*=maxAud/al;

    vec3 p=position+disp+aud;

    // Radial converge/expand — state-driven only (connecting), never audio.
    p*=1.-uConverge;

    // Breath: base breathing is part of the resting identity; audio nudges it a
    // little so a speaking orb visibly pulses without inflating.
    float breath=uBreathAmp*(1.+uAudio*0.18)*sin(uTime*uBreathSpeed);
    p*=1.+breath;

    p=rotY(uRotPhase)*p;
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_Position=projectionMatrix*mv;
    gl_PointSize=uSize*uPixelRatio*aSize*(1./-mv.z);
    vDepth=-mv.z; vDensity=length(disp+aud); vTint=aTint; vSize=aSize;
  }
`;

// ─── Fragment Shader ─────────────────────────────────────────────────────────
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorBase, uColorAccent;
  uniform float uOpacity, uNear, uFar;
  varying float vDepth, vDensity, vTint, vSize;

  void main(){
    float d=length(gl_PointCoord-.5);
    if(d>.5) discard;
    float big=clamp((vSize-1.)/2.,0.,1.);
    float falloff=mix(7.5,3.2,big);
    float sprite=exp(-d*falloff);
    float depthFade=clamp((uFar-vDepth)/(uFar-uNear),0.,1.);
    depthFade=.22+.78*depthFade;
    float densityBoost=.42+.58*smoothstep(.04,.85,vDensity);
    vec3 col=mix(uColorBase,uColorAccent,vTint);
    float alpha=sprite*depthFade*densityBoost*uOpacity*mix(1.,.55,big);
    gl_FragColor=vec4(col,alpha);
  }
`;

// ─── Geometry helpers ────────────────────────────────────────────────────────
const PHI = Math.PI * (3.0 - Math.sqrt(5.0));

/** Deterministic pseudo-random (no Math.random — same geometry every mount). */
function frand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildGeometry(n: number) {
  const pos    = new Float32Array(n * 3);
  const aTint  = new Float32Array(n);
  const aSize  = new Float32Array(n);
  const aLayer = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - (i / n) * 2);
    const phi   = PHI * i;
    // Slight radial jitter so the surface has texture depth
    const r = SPHERE_RADIUS * (1 + (frand(i * 12.9898) - 0.5) * 0.035);
    const s = Math.sin(theta);
    pos[3*i]   = r * s * Math.cos(phi);
    pos[3*i+1] = r * s * Math.sin(phi);
    pos[3*i+2] = r * Math.cos(theta);

    aLayer[i] = 0.5;
    aTint[i]  = frand(i * 78.233 + 1.7) < 0.15 ? 1.0 : 0.0;

    const rnd2 = frand(i * 39.346 + 4.1);
    aSize[i]  = rnd2 < 0.12
      ? 2.2 + rnd2 * 6.0   // bokeh
      : 0.85 + rnd2 * 0.45; // normal
  }
  return { pos, aTint, aSize, aLayer };
}

// ─── Public handle ───────────────────────────────────────────────────────────
export interface ParticleOrbHandle {
  /** Drive the visual state imperatively (bypasses React re-render). */
  setState: (state: VoiceState) => void;
  /** Feed a 0..1 audio level for reactive states (listening / speaking). */
  setAudioLevel: (level: number) => void;
}

interface ParticleOrbProps {
  /**
   * Maximum side length in CSS pixels. The orb shrinks below this on narrow
   * viewports so it never overflows its column. Default 320.
   */
  size?: number;
  /** Canonical voice state — drives every animation parameter. */
  state?: VoiceState;
  /** Live audio level 0..1. Only consumed by audio-reactive states. */
  audioLevel?: number;
  /**
   * Per-frame spectral audio data (level + bass/mid/treble). Read imperatively
   * every frame so speaking/listening motion follows the real voice. Takes
   * precedence over `audioLevel` when present.
   */
  audioData?: React.RefObject<AudioFrame | null>;
  className?: string;
}

export const ParticleOrb = forwardRef<ParticleOrbHandle, ParticleOrbProps>(
function ParticleOrb({ size = 320, state = 'idle', audioLevel = 0, audioData, className = '' }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef      = useRef<HTMLDivElement>(null);
  const stateRef     = useRef<VoiceState>(state);
  const audioRef     = useRef(audioLevel);
  const audioDataRef = useRef<React.RefObject<AudioFrame | null> | undefined>(audioData);
  const rafRef       = useRef<number>(0);

  // Keep props in sync with the imperative refs the render loop reads.
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { audioRef.current = audioLevel; }, [audioLevel]);
  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);

  const setState = useCallback((v: VoiceState) => { stateRef.current = v; }, []);
  const setAudioLevel = useCallback((v: number) => { audioRef.current = v; }, []);

  useImperativeHandle(ref, () => ({ setState, setAudioLevel }), [setState, setAudioLevel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const PARTICLE_COUNT = window.matchMedia('(min-width:768px)').matches ? 90_000 : 35_000;
    const pr = Math.min(window.devicePixelRatio || 1, 2);

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width   = '100%';
    canvas.style.height  = '100%';
    canvas.style.background = 'transparent';
    container.appendChild(canvas);

    // ── Scene / Camera ────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

    // Compute camera Z so the sphere fills the viewport nicely
    let camZ = 11;
    function syncCamera(w: number, h: number) {
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const fovV = (35 * Math.PI) / 180;
      const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
      camZ = (SPHERE_RADIUS * 1.75) / Math.tan(Math.min(fovV, fovH) / 2);
      camera.near = Math.max(0.1, camZ - SPHERE_RADIUS * 3);
      camera.far  = camZ + SPHERE_RADIUS * 3;
      camera.updateProjectionMatrix();
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value  = camera.far;
    }

    // ── Geometry ──────────────────────────────────────────────────────────
    const { pos, aTint, aSize, aLayer } = buildGeometry(PARTICLE_COUNT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos,    3));
    geo.setAttribute('aLayer',   new THREE.BufferAttribute(aLayer, 1));
    geo.setAttribute('aTint',    new THREE.BufferAttribute(aTint,  1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize,  1));

    // ── Uniforms ──────────────────────────────────────────────────────────
    const initial = ORB_STATES[stateRef.current] ?? ORB_STATES.idle;
    const uniforms = {
      uTime:         { value: 0 },
      uRotPhase:     { value: 0 },
      uLoopDuration: { value: LOOP_DURATION },
      uNoiseAmp:     { value: initial.noiseAmp },
      uSize:         { value: POINT_SIZE },
      uPixelRatio:   { value: pr },
      uRotSpeed:     { value: initial.rotSpeed },
      uBreathAmp:    { value: initial.breathAmp },
      uBreathSpeed:  { value: initial.breathSpeed },
      uAmpPulse:     { value: initial.ampPulse },
      uConverge:     { value: initial.converge },
      uRipple:       { value: initial.ripple },
      uAudio:        { value: 0 },
      uBass:         { value: 0 },
      uMid:          { value: 0 },
      uTreble:       { value: 0 },
      uColorBase:    { value: new THREE.Color(initial.colorBase) },
      uColorAccent:  { value: new THREE.Color(initial.colorAccent) },
      uOpacity:      { value: 0 },  // fades in from 0
      uNear:         { value: 0.1 },
      uFar:          { value: 100 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthTest:      false,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    });

    scene.add(new THREE.Points(geo, mat));

    // ── Resize observer ───────────────────────────────────────────────────
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      syncCamera(width, height);
    });
    ro.observe(container);
    syncCamera(container.clientWidth || size, container.clientHeight || size);

    // ── Pointer parallax ──────────────────────────────────────────────────
    let tgtPX = 0, tgtPY = 0, curPX = 0, curPY = 0;
    const onMouse = (e: MouseEvent) => {
      tgtPX = (e.clientX / window.innerWidth  - 0.5) * 2;
      tgtPY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduceMotion) window.addEventListener('mousemove', onMouse);

    // ── Animated scalar bank ──────────────────────────────────────────────
    // Every numeric field in OrbVisualState is lerped generically, so a new
    // state entry animates correctly with no loop changes.
    const current: Record<OrbNumericKey, number> = {
      noiseAmp:      initial.noiseAmp,
      rotSpeed:      initial.rotSpeed,
      breathAmp:     initial.breathAmp,
      breathSpeed:   initial.breathSpeed,
      ampPulse:      initial.ampPulse,
      converge:      initial.converge,
      ripple:        initial.ripple,
      audioReactive: initial.audioReactive,
      opacity:       initial.opacity,
      ring:          initial.ring,
    };

    const colBase   = new THREE.Color(initial.colorBase);
    const colAccent = new THREE.Color(initial.colorAccent);
    const tgtBase   = new THREE.Color();
    const tgtAccent = new THREE.Color();

    let smoothedAudio = 0;
    let sBass = 0, sMid = 0, sTreble = 0;
    let ringPainted = -1;

    // Heavy smoothing so reactions read as fluid surface energy, not twitch:
    // gentle attack, slow release.
    const band = (cur: number, raw: number) =>
      cur + (raw - cur) * (raw > cur ? 0.28 : 0.08);

    // Soft-knee compression: keeps normal speech clearly visible while loud
    // input saturates, so a shout only pushes a bit past a normal voice.
    const compress = (x: number) => x / (1 + x * 0.8);

    // ── Render loop ───────────────────────────────────────────────────────
    const FADE_DURATION = 1000;
    const mountTime = performance.now();
    let prevNow = mountTime;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      const dt  = Math.min((now - prevNow) / 1000, 0.05);
      prevNow   = now;

      const target = ORB_STATES[stateRef.current] ?? ORB_STATES.idle;
      const rate = Math.min((target.enterRate ?? DEFAULT_ENTER_RATE) * (dt * 60), 1);

      // Lerp every numeric field toward the active state.
      for (const key of ORB_NUMERIC_KEYS) {
        current[key] += (target[key] - current[key]) * rate;
      }

      // Lerp colors in the same pass.
      tgtBase.set(target.colorBase);
      tgtAccent.set(target.colorAccent);
      colBase.lerp(tgtBase, rate);
      colAccent.lerp(tgtAccent, rate);

      // Live audio: prefer the per-frame spectral ref, fall back to the scalar
      // prop. Smooth level + each band, then gate everything by the state's
      // reactivity (thinking/idle/etc. read as 0 → purely autonomous motion).
      const frame = audioDataRef.current?.current;
      const rawAudio = Math.min(Math.max(frame ? frame.level : audioRef.current, 0), 1);
      smoothedAudio += (rawAudio - smoothedAudio) * (rawAudio > smoothedAudio ? 0.28 : 0.08);
      sBass   = band(sBass,   frame ? frame.bass   : 0);
      sMid    = band(sMid,    frame ? frame.mid    : 0);
      sTreble = band(sTreble, frame ? frame.treble : 0);

      // Compress after smoothing, then gate by the state's reactivity.
      const react = current.audioReactive;
      uniforms.uNoiseAmp.value    = current.noiseAmp;
      uniforms.uBreathAmp.value   = current.breathAmp;
      uniforms.uBreathSpeed.value = current.breathSpeed;
      uniforms.uAmpPulse.value    = current.ampPulse;
      uniforms.uConverge.value    = current.converge;
      uniforms.uRipple.value      = current.ripple;
      uniforms.uAudio.value       = compress(smoothedAudio) * react;
      uniforms.uBass.value        = compress(sBass) * react;
      uniforms.uMid.value         = compress(sMid) * react;
      uniforms.uTreble.value      = compress(sTreble) * react;
      uniforms.uColorBase.value   = colBase;
      uniforms.uColorAccent.value = colAccent;

      // Rotation is phase-accumulated so speed changes never snap the angle.
      uniforms.uRotSpeed.value = current.rotSpeed;
      uniforms.uRotPhase.value += current.rotSpeed * dt * 60 * (reduceMotion ? 0.25 : 1);

      // Fade in, then respect the state's target opacity.
      const fadeIn = Math.min((now - mountTime) / FADE_DURATION, 1);
      uniforms.uOpacity.value = fadeIn * current.opacity;

      uniforms.uTime.value += reduceMotion ? dt * 0.35 : dt;

      // Outer energy ring — a DOM layer, repainted only when it visibly moves.
      const ringIntensity = current.ring * (1 + compress(smoothedAudio) * current.audioReactive * 0.4);
      if (ringRef.current && Math.abs(ringIntensity - ringPainted) > 0.004) {
        ringPainted = ringIntensity;
        ringRef.current.style.opacity = String(Math.min(ringIntensity, 1));
        ringRef.current.style.transform = `scale(${1 + ringIntensity * 0.06})`;
      }

      // Camera parallax
      curPX += (tgtPX - curPX) * 0.05;
      curPY += (tgtPY - curPY) * 0.05;
      camera.position.set(-curPX * 0.22, curPY * 0.22, camZ);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    tick();

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMouse);
      ro.disconnect();
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [size]);

  const activeColor = (ORB_STATES[state] ?? ORB_STATES.idle).colorBase;

  return (
    <div
      className={`relative ${className}`}
      style={{
        // Fluid up to `size`, with a floor so the sphere never collapses into an
        // unreadable dot on very narrow columns. The ResizeObserver keeps the
        // WebGL viewport in sync with the real box.
        width: `clamp(150px, 100%, ${size}px)`,
        aspectRatio: '1 / 1',
      }}
    >
      {/* Outer energy ring — opacity/transform driven by the render loop */}
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '-6%',
          opacity: 0,
          background: `radial-gradient(circle, transparent 58%, ${activeColor}22 74%, transparent 82%)`,
          transition: 'background 700ms var(--ease-fluid)',
          willChange: 'opacity, transform',
        }}
      />
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

ParticleOrb.displayName = 'ParticleOrb';

// ─── Film Grain ──────────────────────────────────────────────────────────────
export function FilmGrain() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none', opacity: 0.045, mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}
