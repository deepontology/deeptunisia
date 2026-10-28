import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASIS_OPACITY } from '$lib/model';
import type { ChamberSeat } from './Chamber3D.svelte';

/**
 * The chamber scene: an amphitheatre of stepped tiers around the speaker's
 * dais, a chair per seat, and a camera that arrives from above.
 *
 * Seats come in as the flat hemicycle's unit coordinates, so the 3D room and
 * the flat diagram can never disagree about who sits where: x runs across the
 * room, y (negative) toward the back wall, and the row radius r sets how high
 * the seat's tier is.
 *
 * All seats share one instanced mesh, coloured per instance, so a 217-seat room
 * is one draw call. Seats with no recorded holder are a second, translucent
 * mesh: a chair that is there but empty.
 */

const R = 4; // outer row radius, scene units
const TIER = 0.9; // height of the top tier
const MAX = 320;
const GLIDE_MS = 650;
const ARRIVE_MS = 1700;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Any CSS colour, including var() and oklch(), to a three.js colour. */
function resolver() {
	const probe = document.createElement('span');
	probe.style.display = 'none';
	document.body.appendChild(probe);
	const cv = document.createElement('canvas');
	cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true })!;
	const cache = new Map<string, THREE.Color>();
	return {
		color(css: string): THREE.Color {
			const hit = cache.get(css);
			if (hit) return hit.clone();
			probe.style.color = '';
			probe.style.color = css;
			const computed = getComputedStyle(probe).color;
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#000';
			ctx.fillStyle = computed;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
			const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
			cache.set(css, c);
			return c.clone();
		},
		clear() {
			cache.clear();
		},
		dispose() {
			probe.remove();
		}
	};
}

function chairGeometry(): THREE.BufferGeometry {
	const seat = new THREE.BoxGeometry(0.17, 0.045, 0.16);
	seat.translate(0, 0.07, 0.01);
	const back = new THREE.BoxGeometry(0.17, 0.17, 0.035);
	back.translate(0, 0.14, -0.075);
	const leg = new THREE.BoxGeometry(0.06, 0.05, 0.06);
	leg.translate(0, 0.025, 0);
	const g = mergeGeometries([seat, back, leg])!;
	seat.dispose();
	back.dispose();
	leg.dispose();
	return g;
}

export function createChamber(
	host: HTMLElement,
	opts: {
		onhover: (i: number | null) => void;
		onpick: (i: number) => void;
		reduced: () => boolean;
		label: () => string;
	}
) {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	host.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
	const colors = resolver();

	const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.6);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(0xffffff, 1.4);
	sun.position.set(3, 9, 7);
	scene.add(sun);

	// --- the room ----------------------------------------------------------
	const floorMat = new THREE.MeshStandardMaterial({ roughness: 1 });
	const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 1.45, 96), floorMat);
	floor.rotation.x = -Math.PI / 2;
	scene.add(floor);

	const tierMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
	let tiers: THREE.Mesh | null = null;

	const daisMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
	const dais = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.55), daisMat);
	dais.position.set(0, 0.14, 0.75);
	scene.add(dais);
	const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.35), daisMat);
	bench.position.set(0, 0.06, 0.2);
	scene.add(bench);

	/*
	 * THE ROOM AROUND THE ROOM
	 *
	 * The first build was a hemicycle of chairs standing in the dark: a diagram
	 * with depth, not a place. Five primitives turn it into a chamber. A back wall
	 * closes the far side behind the last tier, a carpet grounds the floor, a
	 * platform raises the speaker, and a ring marks the chair under the pointer.
	 * All of it is cheap: one cylinder, one torus, three boxes, one ring.
	 */
	const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide });
	const wall = new THREE.Mesh(
		new THREE.CylinderGeometry(R * 1.52, R * 1.52, 2.4, 96, 1, true, Math.PI / 2, Math.PI),
		wallMat
	);
	wall.position.y = 1.2;
	scene.add(wall);

	// A cornice on the wall's top edge, so the wall reads as built rather than cut.
	const corniceMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
	const cornice = new THREE.Mesh(new THREE.TorusGeometry(R * 1.52, 0.055, 8, 96, Math.PI), corniceMat);
	cornice.rotation.x = -Math.PI / 2;
	cornice.position.y = 2.4;
	scene.add(cornice);

	const carpetMat = new THREE.MeshStandardMaterial({ roughness: 1 });
	const carpet = new THREE.Mesh(new THREE.CircleGeometry(R * 1.2, 96), carpetMat);
	carpet.rotation.x = -Math.PI / 2;
	carpet.position.y = 0.008;
	scene.add(carpet);

	const platformMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
	const platform = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.2), platformMat);
	platform.position.set(0, 0.07, 0.85);
	scene.add(platform);
	const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.34), platformMat);
	step.position.set(0, 0.035, 1.52);
	scene.add(step);
	const accentMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
	const strip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.02, 0.05), accentMat);
	strip.position.set(0, 0.145, 1.44);
	scene.add(strip);

	// --- seats ---------------------------------------------------------------
	const chair = chairGeometry();
	const filledMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
	const emptyMat = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, opacity: 0.32 });
	const filled = new THREE.InstancedMesh(chair, filledMat, MAX);
	const empty = new THREE.InstancedMesh(chair, emptyMat, MAX);
	filled.count = 0;
	empty.count = 0;
	scene.add(filled, empty);

	/*
	 * The chair under the pointer gets a ring. Hover already told the readout who
	 * sits there; the ring says which chair the sentence is about, which the room
	 * could not do on its own once two hundred chairs were in view.
	 */
	const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide });
	const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.18, 40), ringMat);
	hoverRing.rotation.x = -Math.PI / 2;
	hoverRing.visible = false;
	scene.add(hoverRing);

	// Per seat: current, start and target position and colour, for the glide.
	let n = 0;
	const cur = new Float32Array(MAX * 3);
	const from = new Float32Array(MAX * 3);
	const to = new Float32Array(MAX * 3);
	const cCur: THREE.Color[] = [];
	const cFrom: THREE.Color[] = [];
	const cTo: THREE.Color[] = [];
	let isFilled: boolean[] = [];
	let scale = 1;
	let glideT0 = 0;
	let gliding = false;
	let hover: number | null = null;
	let filledIdx: number[] = []; // instance id -> seat index
	let emptyIdx: number[] = [];

	const tmp = new THREE.Object3D();
	let tierRadii: number[] = [];

	function rebuildTiers(radii: number[]) {
		const key = radii.map((r) => r.toFixed(3)).join(',');
		if (key === tierRadii.map((r) => r.toFixed(3)).join(',')) return;
		tierRadii = radii;
		if (tiers) {
			scene.remove(tiers);
			tiers.geometry.dispose();
		}
		// One solid half-ring per row, each as tall as its row's step. Extruded
		// solids are closed at both ends by construction; a profile turned through
		// the half-circle (the first version) left its two cut ends open and their
		// insides showed as grey spikes at the corners of the room.
		const parts: THREE.BufferGeometry[] = [];
		radii.forEach((r, i) => {
			const h = heightOf(r);
			const inner = r * R - 0.22;
			const outer = (radii[i + 1] !== undefined ? radii[i + 1] * R : r * R + 0.4) - 0.22;
			const shape = new THREE.Shape();
			shape.absarc(0, 0, outer, 0, Math.PI, false);
			shape.lineTo(-inner, 0);
			shape.absarc(0, 0, inner, Math.PI, 0, true);
			shape.lineTo(outer, 0);
			const part = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 72 });
			// The shape lies in x/y with the half-ring toward +y; turn it so +y becomes
			// the back of the room (-z) and the extrusion rises along +y.
			part.rotateX(-Math.PI / 2);
			parts.push(part);
		});
		const geo = mergeGeometries(parts)!;
		parts.forEach((g) => g.dispose());
		tiers = new THREE.Mesh(geo, tierMat);
		scene.add(tiers);
	}

	function heightOf(r: number) {
		return ((r - 0.4) / 0.6) * TIER + 0.04;
	}

	function placeInstances() {
		filledIdx = [];
		emptyIdx = [];
		let f = 0;
		let e = 0;
		for (let i = 0; i < n; i++) {
			const x = cur[i * 3];
			const y = cur[i * 3 + 1];
			const z = cur[i * 3 + 2];
			tmp.position.set(x, y, z);
			tmp.rotation.set(0, Math.atan2(-x, 0.75 - z), 0);
			const s = scale * (hover === i ? 1.3 : 1);
			tmp.scale.set(s, s, s);
			tmp.updateMatrix();
			if (isFilled[i]) {
				filled.setMatrixAt(f, tmp.matrix);
				filled.setColorAt(f, cCur[i]);
				filledIdx.push(i);
				f++;
			} else {
				empty.setMatrixAt(e, tmp.matrix);
				emptyIdx.push(i);
				e++;
			}
		}
		filled.count = f;
		empty.count = e;
		filled.instanceMatrix.needsUpdate = true;
		if (filled.instanceColor) filled.instanceColor.needsUpdate = true;
		empty.instanceMatrix.needsUpdate = true;
		filled.computeBoundingSphere();
		empty.computeBoundingSphere();
	}

	let floorColor = new THREE.Color();
	let seatsIn: ChamberSeat[] = [];

	function update(seats: ChamberSeat[]) {
		seatsIn = seats;
		const m = Math.min(MAX, seats.length);
		const radii = [...new Set(seats.map((s) => +s.r.toFixed(4)))].sort((a, b) => a - b);
		if (radii.length) rebuildTiers(radii);

		// Chair size from the closest pair of seats, so 161 and 217 fill the room alike.
		let gap = Infinity;
		for (let i = 0; i < m; i++)
			for (let j = i + 1; j < m; j++) {
				const d = Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y);
				if (d > 1e-6 && d < gap) gap = d;
			}
		scale = Number.isFinite(gap) ? Math.min(1.4, (gap * R) / 0.24) : 1;

		const dimTo = floorColor.clone();
		for (let i = 0; i < m; i++) {
			const s = seats[i];
			const tx = s.x * R;
			const tz = s.y * R;
			const ty = heightOf(s.r);
			const fresh = i >= n;
			for (let k = 0; k < 3; k++) from[i * 3 + k] = fresh ? [tx, ty + 0.6, tz][k] : cur[i * 3 + k];
			to[i * 3] = tx;
			to[i * 3 + 1] = ty;
			to[i * 3 + 2] = tz;
			const base = s.color ? colors.color(s.color) : new THREE.Color(0.5, 0.5, 0.5);
			/*
			 * The same four bases the flat diagram draws as rings, carried into the
			 * room as a wash toward neutral: documented keeps full colour, reported
			 * fades a little, inferred more, unsubstantiated most. Colour still means
			 * the group, so the basis rides on saturation rather than hue.
			 */
			const fade = BASIS_OPACITY[s.basis ?? 'documented'];
			if (fade < 1) base.lerp(floorColor, 1 - fade);
			const target = s.dim ? base.clone().lerp(dimTo, 0.78) : base;
			cFrom[i] = fresh || !cCur[i] ? target.clone() : cCur[i].clone();
			cTo[i] = target;
			cCur[i] = cFrom[i].clone();
			isFilled[i] = !!s.color;
		}
		isFilled = isFilled.slice(0, m);
		n = m;
		glideT0 = performance.now();
		gliding = true;
		if (opts.reduced()) {
			cur.set(to.subarray(0, n * 3));
			for (let i = 0; i < n; i++) cCur[i] = cTo[i].clone();
			gliding = false;
		}
		placeInstances();
		invalidate();
	}

	// --- camera ----------------------------------------------------------------
	const target = new THREE.Vector3(0, 0.25, -1.3);
	let yaw = 0;
	let elev = 0.62;
	/** Once the reader has turned or zoomed the room, a resize stops choosing the angle for them. */
	let touched = false;
	let dist = 7.4;
	let arriveT0 = 0;
	let arriving = false;

	/**
	 * Distance that fits the whole room across the screen. The room's widest
	 * part is its back row, 2R across; the camera backs off until that span plus
	 * a margin fits the horizontal field of view, so a phone in portrait sees the
	 * same room a desktop does, only smaller. `dist` is the reader's own zoom on
	 * top, relative to that fit.
	 */
	function fitDistance(): number {
		const aspect = camera.aspect || 1;
		const vfov = THREE.MathUtils.degToRad(camera.fov);
		const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
		// The front rows sit nearer the camera than the back row and so look
		// wider; the margin covers them as well as the chairs' own width.
		const half = R * 1.42;
		return Math.max(6.5, half / Math.tan(hfov / 2));
	}

	function restPose(out: THREE.Vector3) {
		const d = fitDistance() * (dist / 7.4);
		out.set(
			target.x + d * Math.cos(elev) * Math.sin(yaw),
			target.y + d * Math.sin(elev),
			target.z + d * Math.cos(elev) * Math.cos(yaw)
		);
	}
	const above = new THREE.Vector3();
	const rest = new THREE.Vector3();

	function poseCamera(now: number) {
		restPose(rest);
		if (arriving) {
			const t = Math.min(1, (now - arriveT0) / ARRIVE_MS);
			// From straight above the room, where it reads as the flat diagram,
			// down into the chamber.
			const aspect = camera.aspect || 1;
			above.set(0, fitDistance() * 1.35 * (aspect < 1 ? 1.1 : 1), target.z + 0.02);
			camera.position.lerpVectors(above, rest, ease(t));
			if (t >= 1) arriving = false;
		} else {
			camera.position.copy(rest);
		}
		camera.lookAt(target);
	}

	function arrive() {
		if (opts.reduced()) {
			arriving = false;
		} else {
			arriving = true;
			arriveT0 = performance.now();
		}
		invalidate();
	}

	// --- frame loop, on demand -------------------------------------------------
	let raf = 0;
	function invalidate() {
		if (!raf) raf = requestAnimationFrame(frame);
	}
	function frame(now: number) {
		raf = 0;
		if (gliding) {
			const t = Math.min(1, (now - glideT0) / GLIDE_MS);
			const e = ease(t);
			for (let i = 0; i < n * 3; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
			for (let i = 0; i < n; i++) cCur[i].copy(cFrom[i]).lerp(cTo[i], e);
			placeInstances();
			if (t >= 1) gliding = false;
		}
		poseCamera(now);
		renderer.render(scene, camera);
		if (gliding || arriving || dragging) invalidate();
	}

	// --- theme -----------------------------------------------------------------
	function retheme() {
		colors.clear();
		const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		// Every tone comes from a token; the last resort is neutral, never a theme's hex.
		const get = (v: string, fb: string) => colors.color(css(v) || css(fb) || '#888888');
		floorColor = get('--surface-sunken', '--surface');
		floorMat.color.copy(floorColor);
		carpetMat.color.copy(floorColor);
		tierMat.color.copy(get('--surface-raised', '--surface'));
		daisMat.color.copy(get('--surface-overlay', '--surface-raised'));
		platformMat.color.copy(get('--surface-raised', '--surface'));
		const dark =
			document.documentElement.getAttribute('data-theme') === 'dark' ||
			(() => {
				const hsl = { h: 0, s: 0, l: 0 };
				floorColor.getHSL(hsl);
				return hsl.l < 0.3;
			})();
		/*
		 * The wall is the one tone the palette cannot give us: it has to sit behind
		 * the room in both themes, so it is the floor darkened in light and lifted in
		 * dark. Derived, not a hex, so a theme change moves it with everything else.
		 */
		wallMat.color.copy(floorColor).multiplyScalar(dark ? 1.7 : 0.32);
		corniceMat.color.copy(floorColor).multiplyScalar(dark ? 2.4 : 0.55);
		accentMat.color.copy(get('--accent', '--text-secondary'));
		ringMat.color.copy(get('--text-secondary', '--text'));
		emptyMat.color.copy(get('--border-strong', '--border-subtle'));
		hemi.intensity = dark ? 1.1 : 1.6;
		sun.intensity = dark ? 1.0 : 1.4;
		if (seatsIn.length) update(seatsIn);
		invalidate();
	}

	// --- size ------------------------------------------------------------------
	function resize() {
		const w = host.clientWidth || 1;
		const h = host.clientHeight || 1;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		// A wide screen looks into the room from the side; a narrow one has height to
		// spare and width to save, so it looks down more steeply and the half-ring
		// fills the stage instead of floating in the middle of it.
		if (!touched) elev = camera.aspect < 1.1 ? 1.02 : 0.62;
		invalidate();
	}
	const ro = new ResizeObserver(resize);
	ro.observe(host);

	// --- pointer: hover, pick, and a gentle turn of the room -----------------
	const ray = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	let dragging = false;
	let downX = 0;
	let downY = 0;
	let lastX = 0;
	let lastY = 0;
	let moved = 0;

	function pick(e: PointerEvent): number | null {
		const r = renderer.domElement.getBoundingClientRect();
		ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		const hits = ray.intersectObjects([filled, empty], false);
		const h = hits[0];
		if (!h || h.instanceId === undefined) return null;
		return h.object === filled ? filledIdx[h.instanceId] : emptyIdx[h.instanceId];
	}
	function setHover(i: number | null) {
		if (i === hover) return;
		hover = i;
		placeInstances();
		if (i !== null) {
			hoverRing.position.set(cur[i * 3], cur[i * 3 + 1] + 0.005, cur[i * 3 + 2]);
			hoverRing.scale.setScalar(scale);
			ringMat.color.copy(isFilled[i] ? cCur[i] : emptyMat.color);
			hoverRing.visible = true;
		} else {
			hoverRing.visible = false;
		}
		opts.onhover(i);
		renderer.domElement.style.cursor = i !== null ? 'pointer' : 'grab';
		invalidate();
	}
	const el = renderer.domElement;
	el.addEventListener('pointerdown', (e) => {
		dragging = true;
		moved = 0;
		downX = lastX = e.clientX;
		downY = lastY = e.clientY;
		el.setPointerCapture(e.pointerId);
	});
	el.addEventListener('pointermove', (e) => {
		if (dragging) {
			const dx = e.clientX - lastX;
			const dy = e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
			moved = Math.hypot(e.clientX - downX, e.clientY - downY);
			if (moved > 4) {
				touched = true;
				arriving = false;
				yaw = Math.max(-0.75, Math.min(0.75, yaw - dx * 0.005));
				elev = Math.max(0.28, Math.min(1.3, elev + dy * 0.004));
				invalidate();
			}
			return;
		}
		if (e.pointerType === 'mouse') setHover(pick(e));
	});
	el.addEventListener('pointerup', (e) => {
		dragging = false;
		el.releasePointerCapture?.(e.pointerId);
		if (moved <= 4) {
			const i = pick(e);
			setHover(i);
			if (i !== null && isFilled[i]) opts.onpick(i);
		}
	});
	el.addEventListener('pointerleave', () => {
		if (!dragging) setHover(null);
	});

	/*
	 * the room had no keyboard path: a canvas that only answered a pointer.
	 * Arrow keys walk the hemicycle in seat order, Home and End jump to the ends,
	 * Enter opens the person and Escape clears. The readout is aria-live, so the
	 * name is spoken as the ring moves; the ring is what the sighted reader sees.
	 */
	el.tabIndex = 0;
	el.setAttribute('role', 'application');
	el.setAttribute('aria-label', opts.label());
	let focusIdx: number | null = null;
	el.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			if (!n) return;
			if (e.key === 'Home') focusIdx = 0;
			else if (e.key === 'End') focusIdx = n - 1;
			else if (focusIdx === null) focusIdx = 0;
			else focusIdx = (focusIdx + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
			setHover(focusIdx);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (focusIdx !== null && isFilled[focusIdx]) opts.onpick(focusIdx);
		} else if (e.key === 'Escape') {
			focusIdx = null;
			setHover(null);
		}
	});
	el.addEventListener('blur', () => {
		focusIdx = null;
		setHover(null);
	});
	el.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			touched = true;
			dist = Math.max(4.5, Math.min(11, dist * (e.deltaY > 0 ? 1.06 : 1 / 1.06)));
			arriving = false;
			invalidate();
		},
		{ passive: false }
	);

	resize();
	retheme();

	return {
		update,
		arrive,
		retheme,
		destroy() {
			cancelAnimationFrame(raf);
			ro.disconnect();
			colors.dispose();
			scene.traverse((o) => {
				const m = o as THREE.Mesh;
				m.geometry?.dispose?.();
			});
			[floorMat, tierMat, daisMat, filledMat, emptyMat, wallMat, corniceMat, carpetMat, platformMat, accentMat, ringMat].forEach((m) => m.dispose());
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}
