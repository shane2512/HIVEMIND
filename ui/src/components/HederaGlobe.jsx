import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls, Sphere } from '@react-three/drei';
import * as THREE from 'three';

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function CountryBorders({ radius }) {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    let alive = true;

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson')
      .then((res) => res.json())
      .then((data) => {
        if (alive) {
          setGeoData(data);
        }
      })
      .catch(() => {
        // Quietly skip borders if network fetch fails.
      });

    return () => {
      alive = false;
    };
  }, []);

  const borderLines = useMemo(() => {
    if (!geoData || !Array.isArray(geoData.features)) {
      return [];
    }

    const lines = [];

    for (const feature of geoData.features) {
      const geometry = feature && feature.geometry ? feature.geometry : null;
      if (!geometry) continue;

      if (geometry.type === 'Polygon') {
        for (const polygon of geometry.coordinates || []) {
          lines.push(polygon.map((coord) => latLonToVector3(coord[1], coord[0], radius)));
        }
      }

      if (geometry.type === 'MultiPolygon') {
        for (const multiPolygon of geometry.coordinates || []) {
          for (const polygon of multiPolygon || []) {
            lines.push(polygon.map((coord) => latLonToVector3(coord[1], coord[0], radius)));
          }
        }
      }
    }

    return lines;
  }, [geoData, radius]);

  return (
    <group>
      {borderLines.map((points, idx) => (
        <Line key={`border-${idx}`} points={points} color="#2a2a2a" lineWidth={1.2} transparent opacity={0.38} />
      ))}
    </group>
  );
}

function Node({ position }) {
  const meshRef = useRef(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.strokeStyle = '#0d0d0d';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(128, 128, 100, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(90, 70);
      ctx.lineTo(90, 186);
      ctx.moveTo(166, 70);
      ctx.lineTo(166, 186);
      ctx.moveTo(90, 128);
      ctx.lineTo(166, 128);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
  }, []);

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
    return q;
  }, [position]);

  useFrame((state) => {
    if (meshRef.current) {
      const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 2) * 0.05;
      meshRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group position={position} quaternion={quaternion}>
      <mesh ref={meshRef} position={[0, 0, 0.02]}>
        <planeGeometry args={[0.28, 0.28]} />
        <meshBasicMaterial map={texture} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Globe() {
  const globeRef = useRef(null);
  const ringGroupRef = useRef(null);

  const nodes = useMemo(() => {
    const anchors = [
      [45, -100],
      [-15, -60],
      [50, 15],
      [5, 20],
      [40, 100],
      [-25, 135]
    ];
    return anchors.map(([lat, lon]) => latLonToVector3(lat, lon, 2.05));
  }, []);

  const shaderArgs = useMemo(
    () => ({
      uniforms: {
        uColorTop: { value: new THREE.Color('#ffffff') },
        uColorMid: { value: new THREE.Color('#b7bec7') },
        uColorBottom: { value: new THREE.Color('#8a9099') },
        uLightDirection: { value: new THREE.Vector3(-1, 1, 1).normalize() }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorTop;
        uniform vec3 uColorMid;
        uniform vec3 uColorBottom;
        uniform vec3 uLightDirection;
        varying vec3 vNormal;

        void main() {
          float t = dot(vNormal, uLightDirection) * 0.5 + 0.5;
          vec3 color = t > 0.5
            ? mix(uColorMid, uColorTop, (t - 0.5) * 2.0)
            : mix(uColorBottom, uColorMid, t * 2.0);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    }),
    []
  );

  const orbitalLines = useMemo(() => {
    const makeDashedRing = (xRadius, yRadius, dashSize, gapSize, opacity) => {
      const curve = new THREE.EllipseCurve(0, 0, xRadius, yRadius, 0, Math.PI * 2, false, 0);
      const points2d = curve.getPoints(128);
      const points3d = points2d.map((p) => new THREE.Vector3(p.x, p.y, 0));

      const geometry = new THREE.BufferGeometry().setFromPoints(points3d);
      const material = new THREE.LineDashedMaterial({
        color: '#565656',
        dashSize,
        gapSize,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false
      });

      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      line.renderOrder = 20;
      return line;
    };

    const ring1 = makeDashedRing(1.4, 1.4, 0.08, 0.05, 0.72);
    ring1.rotation.x = 0.4;

    const ring2 = makeDashedRing(1.5, 1.5, 0.06, 0.07, 0.58);
    ring2.rotation.x = 1.1;
    ring2.rotation.z = 0.5;

    return [ring1, ring2];
  }, []);

  const connectorLines = useMemo(() => {
    const links = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      links.push([i, i + 1]);
    }

    return links.map(([a, b]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([nodes[a], nodes[b]]);
      const material = new THREE.LineBasicMaterial({
        color: '#6a6a6a',
        transparent: true,
        opacity: 0.25,
        depthTest: false,
        depthWrite: false
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 20;
      return line;
    });
  }, [nodes]);

  useFrame(() => {
    if (!globeRef.current) {
      return;
    }

    globeRef.current.rotation.y += 0.00065;
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y += 0.00065;
    }
  });

  return (
    <>
      <group ref={globeRef}>
        <Sphere args={[2, 64, 64]}>
          <shaderMaterial attach="material" {...shaderArgs} />
        </Sphere>
        <CountryBorders radius={2.01} />
        {connectorLines.map((line, idx) => (
          <primitive key={`link-${idx}`} object={line} />
        ))}
        {nodes.map((pos, idx) => (
          <Node key={`node-${idx}`} position={pos} />
        ))}
      </group>
      <group ref={ringGroupRef} scale={[1.78, 1.78, 1.78]}>
        {orbitalLines.map((line, idx) => (
          <primitive key={`orbit-${idx}`} object={line} />
        ))}
      </group>
    </>
  );
}

export default function HederaGlobe({ sphereRef }) {
  return (
    <div className="heroSphere" aria-hidden="true" ref={sphereRef}>
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.2} />
        <Globe />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
      </Canvas>
    </div>
  );
}
