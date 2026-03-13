import type React from 'react';

import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import BlurEffect from 'react-progressive-blur';

interface HelixRingsProps {
  levelsUp?: number;
  levelsDown?: number;
  stepY?: number;
  rotationStep?: number;
  xOffset?: number;
}

const HelixRings: React.FC<HelixRingsProps & { quality?: 'low' | 'high' }> = ({
  levelsUp = 10,
  levelsDown = 10,
  stepY = 0.85,
  rotationStep = Math.PI / 16,
  xOffset = 5,
  quality = 'high',
}) => {
  const groupRef = useRef<THREE.Group>(new THREE.Group());

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.005;
    }
  });

  const ringGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const radius = 0.35;
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

    const depth = 10;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: quality === 'low' ? 2 : 4,
      curveSegments: quality === 'low' ? 24 : 64,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }, []);

  const elements = [] as { id: string; y: number; rotation: number }[];
  for (let i = -levelsDown; i <= levelsUp; i++) {
    elements.push({
      id: `helix-ring-${i}`,
      y: i * stepY,
      rotation: i * rotationStep,
    });
  }

  return (
    <group scale={1} position={[xOffset, 0, 0]} ref={groupRef} rotation={[0, 0, 0]}>
      {elements.map((el) => (
        <mesh
          key={el.id}
          geometry={ringGeometry}
          position={[0, el.y, 0]}
          rotation={[0, Math.PI / 2 + el.rotation, 0]}
          castShadow
        >
          <meshPhysicalMaterial
            color="#D4AF37"
            metalness={0.75}
            roughness={0.35}
            clearcoat={0.1}
            clearcoatRoughness={0.2}
            reflectivity={0.2}
            iridescence={0.35}
            iridescenceIOR={1.4}
            iridescenceThicknessRange={[100, 400]}
          />
        </mesh>
      ))}
    </group>
  );
};

const Scene: React.FC<{ quality?: 'low' | 'high'; xOffset?: number }> = ({ quality = 'high', xOffset = 5 }) => {
  return (
    <Canvas
      className="h-full w-full"
      orthographic
      shadows={quality === 'high'}
      dpr={quality === 'low' ? [1, 1.25] : [1, 2]}
      camera={{
        zoom: 70,
        position: [0, 0, 7],
        near: 0.1,
        far: 1000,
      }}
      gl={{ antialias: quality === 'high' }}
      style={{ background: 'transparent' }}
    >
      <hemisphereLight color={'#fff6da'} groundColor={'#0b0b0b'} intensity={1.6} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={2}
        castShadow={quality === 'high'}
        color={'#ffeedd'}
        shadow-mapSize-width={quality === 'high' ? 2048 : 512}
        shadow-mapSize-height={quality === 'high' ? 2048 : 512}
      />
      <HelixRings
        quality={quality}
        xOffset={xOffset}
        levelsUp={quality === 'low' ? 7 : 10}
        levelsDown={quality === 'low' ? 7 : 10}
      />
      {quality === 'high' ? (
        <EffectComposer multisampling={4}>
          <Bloom kernelSize={3} luminanceThreshold={0} luminanceSmoothing={0.4} intensity={0.45} />
          <Bloom kernelSize={KernelSize.HUGE} luminanceThreshold={0} luminanceSmoothing={0} intensity={0.35} />
        </EffectComposer>
      ) : null}
    </Canvas>
  );
};

export interface HeroProps {
  title: string;
  description: string;
}

// Full-screen, light hero (as provided in the integration request)
export const Hero: React.FC<HeroProps> = ({ title, description }) => {
  const [quality, setQuality] = useState<'low' | 'high'>('high');

  useEffect(() => {
    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const isSmall = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;
    if (isCoarse || isSmall) setQuality('low');
  }, []);

  return (
    <section className="relative h-screen w-screen overflow-hidden bg-white font-sans tracking-tight text-gray-900">
      <div className="absolute inset-0 z-0">
        <Scene quality={quality} />
      </div>

      <div className="absolute bottom-4 left-4 z-20 max-w-md md:bottom-10 md:left-10">
        <h1 className="mb-3 text-3xl font-light tracking-tight">{title}</h1>
        <p className="text-sm font-light leading-relaxed tracking-tight text-gray-700">{description}</p>
      </div>

      <BlurEffect
        className="absolute bottom-0 h-1/2 w-full bg-gradient-to-b from-transparent to-white/20 md:h-1/3"
        position="bottom"
        intensity={50}
      />
      <BlurEffect
        className="absolute top-0 h-1/2 w-full bg-gradient-to-b from-white/20 to-transparent md:h-1/3"
        position="top"
        intensity={50}
      />
    </section>
  );
};

export function HelixBadge3D({
  className = '',
  quality = 'low',
  xOffset = 0,
}: {
  className?: string;
  quality?: 'low' | 'high';
  xOffset?: number;
}) {
  return (
    <div className={`relative h-40 overflow-hidden rounded-2xl border border-black/10 bg-white ${className}`}>
      <div className="absolute inset-0 opacity-95">
        <Scene quality={quality} xOffset={xOffset} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-black/10" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </div>
  );
}

export interface HelixHeroProps {
  title: string;
  description: string;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
}

// Contained, dark card hero (safe for app pages)
export function HelixHero({
  title,
  description,
  ctaPrimary,
  ctaSecondary,
}: HelixHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/60 p-6 backdrop-blur md:p-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute -bottom-48 right-[-20%] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
            Castro de Oliveira Advocacia
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h1>
          <p className="mt-3 max-w-xl text-sm text-white/70 md:text-base">{description}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            {ctaPrimary ? (
              <a
                href={ctaPrimary.href}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white/90"
              >
                {ctaPrimary.label}
              </a>
            ) : null}
            {ctaSecondary ? (
              <a
                href={ctaSecondary.href}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
              >
                {ctaSecondary.label}
              </a>
            ) : null}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { t: 'Clientes', d: 'Cadastro e histórico' },
              { t: 'Casos', d: 'Status e acompanhamento' },
              { t: 'Rotina', d: 'Fluxo padronizado' },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">{x.t}</div>
                <div className="mt-1 text-xs text-white/60">{x.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-[320px] overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/40 md:h-[420px]">
          <BlurEffect className="absolute inset-0" position="top" intensity={70} />
          <div className="absolute inset-0 opacity-90">
            <Scene quality="low" />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-neutral-950/0 via-neutral-950/20 to-neutral-950/70" />
        </div>
      </div>
    </section>
  );
}
