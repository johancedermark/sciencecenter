/** 2D (XZ-plane) collision: the visitor is a circle, walls are segments. */
export interface Segment {
  ax: number; az: number; bx: number; bz: number;
}

export class Collision {
  readonly segments: Segment[] = [];
  /** Segments that can be switched off (doors). */
  readonly gates = new Map<string, { segs: Segment[]; open: boolean }>();

  add(ax: number, az: number, bx: number, bz: number) {
    this.segments.push({ ax, az, bx, bz });
  }

  /** Add a closed polygon (e.g. a rotated box) as segments. */
  addPolygon(pts: [number, number][]) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.add(a[0], a[1], b[0], b[1]);
    }
  }

  addGate(id: string, ax: number, az: number, bx: number, bz: number) {
    this.gates.set(id, { segs: [{ ax, az, bx, bz }], open: false });
  }

  setGate(id: string, open: boolean) {
    const g = this.gates.get(id);
    if (g) g.open = open;
  }

  /** Push the circle (x,z,r) out of all segments. Returns the corrected position. */
  resolve(x: number, z: number, r: number): [number, number] {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const test = (s: Segment) => {
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz || 1e-9;
        let tt = ((x - s.ax) * dx + (z - s.az) * dz) / len2;
        tt = Math.max(0, Math.min(1, tt));
        const cx = s.ax + dx * tt;
        const cz = s.az + dz * tt;
        let nx = x - cx;
        let nz = z - cz;
        const d = Math.hypot(nx, nz);
        if (d < r) {
          if (d < 1e-6) {
            nx = -dz;
            nz = dx;
          }
          const nl = Math.hypot(nx, nz) || 1;
          x = cx + (nx / nl) * r;
          z = cz + (nz / nl) * r;
          moved = true;
        }
      };
      for (const s of this.segments) test(s);
      for (const g of this.gates.values()) if (!g.open) g.segs.forEach(test);
      if (!moved) break;
    }
    return [x, z];
  }
}
