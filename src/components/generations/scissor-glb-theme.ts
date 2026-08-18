import * as THREE from 'three';

/** Read the current --background HSL token from :root and convert to a THREE.Color */
export function getThemeBgColor(): THREE.Color {
  try {
    const style = getComputedStyle(document.documentElement);
    const raw = style.getPropertyValue('--background').trim(); // e.g. "0 0% 0%"
    if (raw) {
      const parts = raw.split(/\s+/);
      if (parts.length >= 3) {
        const h = parseFloat(parts[0]) / 360;
        const s = parseFloat(parts[1]) / 100;
        const l = parseFloat(parts[2]) / 100;
        return new THREE.Color().setHSL(h, s, l);
      }
    }
  } catch { /* fallback */ }
  return new THREE.Color(0x0a0a0a);
}
