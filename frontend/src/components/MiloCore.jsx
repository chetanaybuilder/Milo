import { Component, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Per-state look: colour, motion speed, emissive energy.
const LOOK = {
  IDLE: { c: '#6aa8ff', s: 0.25, e: 0.7 },
  LISTENING: { c: '#4fe3c1', s: 0.6, e: 1.0 },
  THINKING: { c: '#a994ff', s: 1.8, e: 1.2 },
  TOOL_USE: { c: '#ffc56e', s: 1.5, e: 1.2 },
  SPEAKING: { c: '#86d4ff', s: 1.1, e: 1.5 },
  ERROR: { c: '#c98a9a', s: 0.12, e: 0.45 },
};
const WAVE_N = 120;

function Scene({ state, getLevel, reduced, mobile, onInterrupt, burstTrigger }) {
  const group = useRef(), core = useRef(), coreMat = useRef(), glowMat = useRef(), shellMat = useRef();
  const rings = useRef([]), pts = useRef(), ptsMat = useRef(), dust = useRef(), dustMat = useRef();
  const color = useMemo(() => new THREE.Color(LOOK.IDLE.c), []);
  const target = useMemo(() => new THREE.Color(), []);
  const sp = useRef(LOOK.IDLE.s), en = useRef(LOOK.IDLE.e), lv = useRef(0);
  const burst = useRef(0);
  const N = mobile ? 450 : 1200;
  const DUST_N = mobile ? 120 : 350;

  // Primary energetic particle field
  const { positions, originalPositions } = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const orig = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.1 + Math.random() * 3.2;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th);
      const y = r * Math.sin(ph) * Math.sin(th) * 0.75;
      const z = r * Math.cos(ph);
      pos.set([x, y, z], i * 3);
      orig.set([x, y, z], i * 3);
    }
    return { positions: pos, originalPositions: orig };
  }, [N]);

  // Ambient outer stardust particles
  const dustPositions = useMemo(() => {
    const pos = new Float32Array(DUST_N * 3);
    for (let i = 0; i < DUST_N; i++) {
      const r = 4.0 + Math.random() * 5.0;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      ], i * 3);
    }
    return pos;
  }, [DUST_N]);

  const wave = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAVE_N * 3), 3));
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }));
  }, []);

  // Trigger burst animation from external trigger prop
  useEffect(() => {
    if (burstTrigger > 0) {
      burst.current = 1.0;
    }
  }, [burstTrigger]);

  const handlePointerDown = (e) => {
    e.stopPropagation?.();
    burst.current = 1.0;
    if (state === 'SPEAKING') {
      onInterrupt?.();
    }
  };

  useFrame((s, dt) => {
    const L = LOOK[state] || LOOK.IDLE;
    const a = Math.min(1, dt * 3.5), t = s.clock.elapsedTime, k = reduced ? 0.3 : 1;
    target.set(L.c); color.lerp(target, a);
    sp.current += (L.s * k - sp.current) * a;
    en.current += (L.e - en.current) * a;
    lv.current += (getLevel() - lv.current) * Math.min(1, dt * 12);
    burst.current *= Math.pow(0.05, dt); // smooth exponential decay

    const breathe = reduced ? 0 : Math.sin(t * 1.3) * 0.04;
    const coreScale = (1 + breathe + lv.current * 0.35 * (reduced ? 0.4 : 1)) * (1 - burst.current * 0.15);

    core.current.scale.setScalar(coreScale);
    core.current.rotation.y += dt * sp.current * 0.35;
    core.current.rotation.z += dt * sp.current * 0.15;
    coreMat.current.emissive.copy(color);
    coreMat.current.emissiveIntensity = en.current * (0.75 + lv.current * 0.8 + burst.current * 1.5);
    glowMat.current.color.copy(color);
    glowMat.current.opacity = 0.08 + burst.current * 0.25;
    shellMat.current.color.copy(color);
    ptsMat.current.color.copy(color);
    ptsMat.current.size = (mobile ? 0.024 : 0.03) + burst.current * 0.05 + lv.current * 0.015;
    ptsMat.current.opacity = Math.min(1, 0.65 + burst.current * 0.35);
    dustMat.current.color.copy(color);
    wave.material.color.copy(color);

    // Orbital rings with dynamic energy and tilt
    rings.current.forEach((r, i) => {
      if (!r) return;
      const dir = i % 2 ? -1 : 1;
      r.rotation.x += dt * sp.current * (0.18 + i * 0.12) * dir;
      r.rotation.y += dt * sp.current * 0.25;
      r.scale.setScalar(1 + burst.current * (0.35 + i * 0.2) + lv.current * 0.1);
      r.material.color.copy(color);
    });

    // Swirling particle field with shockwave expansion
    pts.current.rotation.y += dt * 0.05 * (1 + sp.current * 1.5);
    pts.current.rotation.x += dt * 0.02 * sp.current;
    pts.current.scale.setScalar(1 + burst.current * 0.9 + lv.current * 0.15);

    // Outer ambient stardust gently drifting
    dust.current.rotation.y -= dt * 0.015;
    dust.current.rotation.z += dt * 0.008;

    // Responsive waveform audio ring
    const pos = wave.geometry.attributes.position;
    const amp = 0.08 + lv.current * 0.6 + burst.current * 0.8;
    for (let i = 0; i < WAVE_N; i++) {
      const th = (i / WAVE_N) * Math.PI * 2;
      const r = 1.6 + (Math.sin(th * 6 + t * sp.current * 3.5) * 0.35 + Math.sin(th * 12 - t * 2.1) * 0.25) * amp;
      pos.setXYZ(i, Math.cos(th) * r, Math.sin(th) * r, 0);
    }
    pos.needsUpdate = true;

    if (!reduced) {
      group.current.rotation.y += (s.pointer.x * 0.35 - group.current.rotation.y) * a;
      group.current.rotation.x += (-s.pointer.y * 0.25 - group.current.rotation.x) * a;
    }
  });

  return (
    <group ref={group} onPointerDown={handlePointerDown}>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 5]} intensity={25} />
      <pointLight position={[-3, -2, -3]} intensity={12} color="#4fe3c1" />
      <mesh ref={core}>
        <icosahedronGeometry args={[1, mobile ? 2 : 3]} />
        <meshStandardMaterial ref={coreMat} color="#070b16" roughness={0.3} metalness={0.4} emissive="#6aa8ff" />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.24, 1]} />
        <meshBasicMaterial ref={shellMat} wireframe transparent opacity={0.18} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.75, 24, 24]} />
        <meshBasicMaterial ref={glowMat} side={THREE.BackSide} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {[2.1, 2.65, 3.2].map((r, i) => (
        <mesh key={r} ref={(el) => (rings.current[i] = el)} rotation={[1.1 + i * 0.5, i * 0.7, 0]}>
          <torusGeometry args={[r, 0.009, 6, mobile ? 72 : 128]} />
          <meshBasicMaterial transparent opacity={0.48 - i * 0.1} />
        </mesh>
      ))}
      {/* High-density dynamic orbital particle cloud */}
      <points ref={pts}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={N} array={positions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial ref={ptsMat} size={0.03} transparent opacity={0.7} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {/* Ambient background stardust */}
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={DUST_N} array={dustPositions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial ref={dustMat} size={0.02} transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <primitive object={wave} />
    </group>
  );
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function Fallback({ state, onInterrupt }) {
  return (
    <div className={`orb-fallback orb-${state.toLowerCase()}`} onClick={state === 'SPEAKING' ? onInterrupt : undefined} aria-hidden="true">
      <i /><i /><i />
    </div>
  );
}

export default function MiloCore({ state, getLevel, reduced, onInterrupt }) {
  const [failed, setFailed] = useState(() => !webglOk());
  const [burstCount, setBurstCount] = useState(0);
  const mobile = window.innerWidth < 700;

  const handleInterrupt = () => {
    setBurstCount((c) => c + 1);
    onInterrupt?.();
  };

  if (failed) return <Fallback state={state} onInterrupt={handleInterrupt} />;
  return (
    <div className={`core${state === 'SPEAKING' ? ' can-interrupt' : ''}`}
      onClick={state === 'SPEAKING' ? handleInterrupt : undefined}
      title={state === 'SPEAKING' ? 'Click to interrupt' : undefined}
      role={state === 'SPEAKING' ? 'button' : undefined}
      aria-label={state === 'SPEAKING' ? 'Click orb to interrupt speaking' : undefined}>
      <Boundary onError={() => setFailed(true)}>
        <Canvas camera={{ position: [0, 0, 7.5], fov: 45 }} dpr={[1, mobile ? 1.5 : 2]}
          gl={{ antialias: !mobile, alpha: true, powerPreference: 'high-performance' }}>
          <Scene state={state} getLevel={getLevel} reduced={reduced} mobile={mobile} onInterrupt={handleInterrupt} burstTrigger={burstCount} />
        </Canvas>
      </Boundary>
    </div>
  );
}
