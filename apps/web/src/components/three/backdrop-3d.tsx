"use client";
/**
 * Ambient 3D world behind the whole interface: a receding grid floor, a "skyline" of
 * candlestick towers on the horizon, and drifting particles, with gentle mouse parallax.
 * Decorative only (aria-hidden): 30 fps cap, pauses when the tab is hidden, renders a single
 * static frame for prefers-reduced-motion, and is not mounted when depth is "off".
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Backdrop3D({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the plain dark background remains
    }
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    el.appendChild(renderer.domElement);

    const BG = new THREE.Color("#05070b");
    const scene = new THREE.Scene();
    scene.background = BG;
    scene.fog = new THREE.FogExp2(BG, 0.0082);
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 400);
    camera.position.set(0, 9, 34);

    // grid floor that scrolls toward the viewer
    const grid = new THREE.GridHelper(400, 100, "#0e7490", "#0f1b2d");
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.75 * intensity;
    scene.add(grid);

    // horizon glow
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 60),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uA: { value: 0.5 * intensity } },
        vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "varying vec2 vUv; uniform float uA; void main(){ float d=1.0-abs(vUv.y-0.35)*2.2; float x=1.0-abs(vUv.x-0.5)*1.6; gl_FragColor=vec4(0.06,0.45,0.75, max(d,0.0)*max(x,0.0)*uA); }",
      }),
    );
    glow.position.set(0, 18, -150);
    scene.add(glow);

    // candlestick skyline on the horizon (instanced)
    const N = 140;
    const towers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.6, 1, 1.6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75 * intensity }),
      N,
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const bull = new THREE.Color("#16a34a");
    const bear = new THREE.Color("#dc2626");
    let p = 0;
    for (let i = 0; i < N; i++) {
      p += (Math.sin(i * 0.37) + Math.sin(i * 0.11) * 0.8) * 0.9 + (Math.random() - 0.5) * 2;
      const h = 4 + Math.abs(p) * 0.9 + Math.random() * 6;
      const x = (i - N / 2) * 2.6;
      const z = -95 - Math.random() * 25;
      m4.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(1, h, 1));
      towers.setMatrixAt(i, m4);
      towers.setColorAt(i, Math.random() > 0.45 ? bull : bear);
    }
    scene.add(towers);

    // particles
    const COUNT = 700;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 220;
      pos[i * 3 + 1] = Math.random() * 60 + 1;
      pos[i * 3 + 2] = -Math.random() * 160 + 30;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: "#38bdf8", size: 0.35, transparent: true, opacity: 0.6 * intensity, depthWrite: false }));
    scene.add(points);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0, y: 0 };
    const onMouse = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      if (reduced) renderer.render(scene, camera);
    };
    window.addEventListener("pointermove", onMouse, { passive: true });
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 33) return; // ~30 fps cap
      last = now;
      const t = (now - t0) / 1000;
      grid.position.z = (t * 2.2) % 4; // seamless: grid cell = 4 units
      const a = points.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        let z = a.getZ(i) + 0.06;
        if (z > 34) z -= 190;
        a.setZ(i, z);
      }
      a.needsUpdate = true;
      camera.position.x += (mouse.x * 3 - camera.position.x) * 0.04;
      camera.position.y += (9 - mouse.y * 1.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 6, -60);
      renderer.render(scene, camera);
    };
    if (reduced) {
      camera.lookAt(0, 6, -60);
      renderer.render(scene, camera);
    } else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMouse);
      window.removeEventListener("resize", onResize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [intensity]);

  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />;
}
