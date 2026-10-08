import { Component, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Per-state look: colour, motion speed, emissive energy.
const LOOK = {
  IDLE: { c: '#6aa8ff', s: 0.25, e: 0.7 },
  LISTENING: { c: '#4fe3c1', s: 0.6, e: 1.0 },
  THINKING: { c: '#a994ff', s: 1.7, e: 1.1 },
  TOOL_USE: { c: '#ffc56e', s: 1.4, e: 1.1 },
  SPEAKING: { c: '#86d4ff', s: 0.9, e: 1.4 },
  ERROR: { c: '#c98a9a', s: 0.12, e: 0.45 },
};
const WAVE_N = 96;

function Scene({ state, getLevel, reduced, mobile }) {
  const group = useRef(), core = useRef(), coreMat = useRef(), glowMat = useRef(), shellMat = useRef();
  const rings = useRef([]), pts = useRef(), ptsMat = useRef();
  const color = useMemo(() => new THREE.Color(LOOK.IDLE.c), []);
  const target = useMemo(() => new THREE.Color(), []);
  const sp = useRef(LOOK.IDLE.s), en = useRef(LOOK.IDLE.e), lv = useRef(0);
  const N = mobile ? 200 : 500;

  const positions = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.4 + Math.random() * 2.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      a.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.7, r * Math.cos(ph)], i * 3);
    }
    return a;
  }, [N]);

  const wave = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAVE_N * 3), 3));
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }));
  }, []);

  useFrame((s, dt) => {
    const L = LOOK[state] || LOOK.IDLE;
    const a = Math.min(1, dt * 3), t = s.clock.elapsedTime, k = reduced ? 0.3 : 1;
    target.set(L.c); color.lerp(target, a);
    sp.current += (L.s * k - sp.current) * a;
    en.current += (L.e - en.current) * a;
    lv.current += (getLevel() - lv.current) * Math.min(1, dt * 12);
    const breathe = reduced ? 0 : Math.sin(t * 1.2) * 0.03;

    core.current.scale.setScalar(1 + breathe + lv.current * 0.3 * (reduced ? 0.4 : 1));
    core.current.rotation.y += dt * sp.current * 0.3;
    coreMat.current.emissive.copy(color);
    coreMat.current.emissiveIntensity = en.current * (0.7 + lv.current);
    glowMat.current.color.copy(color);
    shellMat.current.color.copy(color);
    ptsMat.current.color.copy(color);
    wave.material.color.copy(color);

    rings.current.forEach((r, i) => {
      if (!r) return;
      const dir = i % 2 ? -1 : 1;
      r.rotation.x += dt * sp.current * (0.15 + i * 0.1) * dir;
      r.rotation.y += dt * sp.current * 0.2;
      r.material.color.copy(color);
    });
    pts.current.rotation.y += dt * 0.03 * (1 + sp.current);

    const pos = wave.geometry.attributes.position;
    const amp = 0.06 + lv.current * 0.55;
    for (let i = 0; i < WAVE_N; i++) {
      const th = (i / WAVE_N) * Math.PI * 2;
      const r = 1.6 + (Math.sin(th * 6 + t * sp.current * 3) * 0.35 + Math.sin(th * 11 - t * 1.7) * 0.2) * amp;
      pos.setXYZ(i, Math.cos(th) * r, Math.sin(th) * r, 0);
    }
    pos.needsUpdate = true;

    if (!reduced) {
      group.current.rotation.y += (s.pointer.x * 0.3 - group.current.rotation.y) * a;
      group.current.rotation.x += (-s.pointer.y * 0.2 - group.current.rotation.x) * a;
    }
  });

  return (
    <group ref={group}>
      <ambientLight intensity={0.3} />
      <pointLight position={[3, 3, 5]} intensity={20} />
      <mesh ref={core}>
        <icosahedronGeometry args={[1, mobile ? 2 : 3]} />
        <meshStandardMaterial ref={coreMat} color="#070b16" roughness={0.35} metalness={0.3} emissive="#6aa8ff" />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.22, 1]} />
        <meshBasicMaterial ref={shellMat} wireframe transparent opacity={0.16} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.7, 24, 24]} />
        <meshBasicMaterial ref={glowMat} side={THREE.BackSide} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {[2.1, 2.6, 3.1].map((r, i) => (
        <mesh key={r} ref={(el) => (rings.current[i] = el)} rotation={[1.1 + i * 0.5, i * 0.7, 0]}>
          <torusGeometry args={[r, 0.008, 6, mobile ? 72 : 128]} />
          <meshBasicMaterial transparent opacity={0.45 - i * 0.1} />
        </mesh>
      ))}
      <points ref={pts}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={N} array={positions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial ref={ptsMat} size={0.025} transparent opacity={0.6} sizeAttenuation depthWrite={false} />
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

function Fallback({ state }) {
  return <div className={`orb-fallback orb-${state.toLowerCase()}`} aria-hidden="true"><i /><i /><i /></div>;
}

export default function MiloCore({ state, getLevel, reduced }) {
  const [failed, setFailed] = useState(() => !webglOk());
  const mobile = window.innerWidth < 700;
  if (failed) return <Fallback state={state} />;
  return (
    <div className="core" aria-hidden="true">
      <Boundary onError={() => setFailed(true)}>
        <Canvas camera={{ position: [0, 0, 7.5], fov: 45 }} dpr={[1, mobile ? 1.5 : 2]}
          gl={{ antialias: !mobile, alpha: true, powerPreference: 'high-performance' }}>
          <Scene state={state} getLevel={getLevel} reduced={reduced} mobile={mobile} />
        </Canvas>
      </Boundary>
    </div>
  );
}
