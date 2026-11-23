// Jointed paper puppets. Profile silhouettes facing +x (mirror with face:-1). Units: u = height/100.
// Torso and head are cut shapes; limbs are thick stroked polylines; arms are solved with a two-bone IK from a hand target.
// Identity is in the outline (hair, glasses cut as holes, clothing), because the style is silhouette: no faces are drawn.
const D = Math.PI / 180;

export const WHO = {
  aaron:  { H: 100, hair: 'crop',   glasses: false, cloth: 'shirt',  build: 1.04 },
  daniel: { H: 105, hair: 'part',   glasses: true,  cloth: 'polo',   build: 1.0 },
  sarah:  { H: 94,  hair: 'long',   glasses: false, cloth: 'blouse', build: .9, skirt: true },
  acct:   { H: 97,  hair: 'bun',    glasses: true,  cloth: 'cardigan', build: 1.0 },
  rep:    { H: 101, hair: 'slick',  glasses: false, cloth: 'jacket', build: 1.0 },
  adviser:{ H: 99,  hair: 'slick',  glasses: true,  cloth: 'jacket', build: .98 },
  worker: { H: 98,  hair: 'cap',    glasses: false, cloth: 'vest',   build: 1.0 },
  worker2:{ H: 92,  hair: 'crop',   glasses: false, cloth: 'vest',   build: 1.1 },
  kid:    { H: 58,  hair: 'crop',   glasses: false, cloth: 'shirt',  build: .8 },
  kid2:   { H: 50,  hair: 'long',   glasses: false, cloth: 'blouse', build: .8 },
};

function ik(S, T, L1, L2, dir = 1) {          // elbow point for a hand target T; dir picks the bend side
  let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy), m = L1 + L2 - .01;
  if (d > m) { dx *= m / d; dy *= m / d; d = m; }
  if (d < Math.abs(L1 - L2) + .01) d = Math.abs(L1 - L2) + .01;
  const a = Math.atan2(dy, dx), c = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const ang = a + dir * c; return [S[0] + Math.cos(ang) * L1, S[1] + Math.sin(ang) * L1, S[0] + dx, S[1] + dy];
}

function headPath(g, hc) {                    // profile head, centre hc (u-space, already scaled by caller)
  g.beginPath();
  const pts = [[-2.8, -86], [-5.6, -88.5], [-6.5, -92.4], [-4.8, -97.2], [-0.8, -99], [3.6, -97.6], [6.0, -94.6], [6.5, -92], [8.5, -89.6], [6.7, -88.6], [7.0, -87.5], [6.3, -86.5], [5.4, -83.8], [2.9, -82.4], [2.1, -80]];
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.closePath(); g.fill();
}
function hair(g, kind) {
  g.beginPath();
  if (kind === 'crop')  { g.moveTo(-7.2, -90); g.quadraticCurveTo(-7.8, -99, -1.5, -100.6); g.quadraticCurveTo(5, -100.6, 6.6, -94.6); g.lineTo(5.2, -95); g.lineTo(-5, -91.5); }
  if (kind === 'part')  { g.moveTo(-7.2, -90); g.quadraticCurveTo(-8, -99.5, -1, -101.4); g.quadraticCurveTo(6.2, -102, 9, -96.5); g.quadraticCurveTo(6.8, -97.6, 5, -96); g.lineTo(-5, -91.5); }
  if (kind === 'long')  { g.moveTo(-6.6, -93); g.quadraticCurveTo(-9.4, -100, -1.5, -100.8); g.quadraticCurveTo(5, -100.2, 6.5, -94.6); g.lineTo(3, -95); g.lineTo(-1, -90); g.lineTo(-1.6, -78.5); g.quadraticCurveTo(-5.5, -73, -9.6, -76.8); g.quadraticCurveTo(-10.6, -86, -7.4, -93); }
  if (kind === 'bun')   { g.moveTo(-7, -91); g.quadraticCurveTo(-7.6, -99, -1.5, -100.2); g.quadraticCurveTo(4.6, -100.2, 6.3, -94.8); g.lineTo(-5, -91.5); g.moveTo(-6.4, -96); g.arc(-7.6, -97.6, 3.1, 0, 7); }
  if (kind === 'slick') { g.moveTo(-7, -90.5); g.quadraticCurveTo(-7.6, -99.2, -1.5, -100.4); g.quadraticCurveTo(5, -100.2, 6.5, -94.4); g.lineTo(4.4, -95.4); g.lineTo(-5, -92); }
  if (kind === 'cap')   { g.moveTo(-7.2, -91); g.quadraticCurveTo(-8, -99.6, -1.5, -101); g.quadraticCurveTo(5.5, -101, 9.6, -95.6); g.lineTo(5.6, -95.4); g.lineTo(-5, -92); }
  g.closePath(); g.fill();
}

// spec: { who, x, y, h, face:1|-1, seated, pose, col, rim, shade, prop, bend }
//   x,y = feet (standing) or hip (seated); h = pixel height of a 100u figure
// pose: { lean, tilt, hand1:[x,y]|null, hand2:[x,y]|null, gait (0..1 walking phase), bob, propRot }
//   hand targets are in u with the feet as origin (hip at y=-47, shoulder at y=-79), +x forward, so a phone at the ear is about [9,-90]
export function drawFigure(g, spec) {
  const w = WHO[spec.who] || WHO.aaron, p = spec.pose || {}, u = (spec.h || 500) / 100 * (w.H / 100), face = spec.face || 1;
  const col = spec.col || '#070d1b', rim = spec.rim || 'rgba(255,214,150,.6)', shade = spec.shade || 'rgba(0,0,0,.7)';
  const wk = p.gait || 0, sw = Math.sin(wk * 2 * Math.PI);
  const bob = spec.seated ? (p.bob || 0) : (p.bob || 0) - Math.abs(Math.sin(wk * Math.PI)) * .9;
  for (const [oy, c] of [[-2.4, rim], [2.2, shade], [0, col]]) {            // rim copy (up), shade copy (down), body
    const body = c === col;
    g.save(); g.translate(spec.x, spec.y + oy); g.scale(face * u, u); g.translate(0, (spec.seated ? 47 : 0) + bob);
    g.globalAlpha = body ? 1 : (c === rim ? .75 : .9); g.fillStyle = c; g.strokeStyle = c; g.lineCap = 'round'; g.lineJoin = 'round';
    if (!spec.seated) {                                                     // legs
      const k1 = 3 + sw * 12, k2 = -3 - sw * 12;
      for (const [k, wd] of [[k2, .92], [k1, 1]]) {
        g.lineWidth = 9.4 * w.build * wd; g.beginPath(); g.moveTo(0, -47); g.lineTo(k * .45 + .5, -25); g.stroke();
        g.lineWidth = 7.4 * w.build * wd; g.beginPath(); g.moveTo(k * .45 + .5, -25); g.lineTo(k - .5, -5); g.stroke();
        g.beginPath(); g.moveTo(k - 4.2, -6.4); g.lineTo(k + 2.5, -6.8); g.quadraticCurveTo(k + 10.5, -5.5, k + 10.8, -.2); g.lineTo(k - 4.4, -.2); g.closePath(); g.fill(); }
      if (w.skirt) { g.beginPath(); g.moveTo(-5.5, -49); g.lineTo(5.5, -49); g.lineTo(8, -23); g.lineTo(-7, -23); g.closePath(); g.fill(); }
    } else { g.lineWidth = 9.4; g.beginPath(); g.moveTo(0, -47); g.lineTo(21, -47); g.stroke(); g.lineWidth = 7.4; g.beginPath(); g.moveTo(21, -47); g.lineTo(22, -9); g.stroke(); g.beginPath(); g.moveTo(18, -8); g.lineTo(32, -8); g.lineTo(32, -.4); g.lineTo(18, -.4); g.closePath(); g.fill(); }
    g.save(); g.translate(0, -47); g.rotate((p.lean || 0) * D); g.translate(0, 47);   // torso leans about the hip
    const jb = w.cloth === 'jacket' || w.cloth === 'cardigan', B = w.build;
    g.beginPath(); g.moveTo(-5.6 * B, -45); g.bezierCurveTo(-7.2 * B, -60, -6.6 * B, -72, -4.6, -80.5); g.lineTo(2.2, -82);
    g.bezierCurveTo(5.8 * B, -79, 6.6 * B, -70, 6.2 * B, -62); g.bezierCurveTo(6 * B, -56, 5.6 * B, -50, 5.4 * B, jb ? -40 : -45);
    if (jb) g.lineTo(-6.4 * B, -41); g.closePath(); g.fill();
    g.save(); g.translate(0, -84); g.rotate((p.tilt || 0) * D); g.translate(0, 84);   // head tilts about the neck
    g.fillRect(-2.6, -86.5, 5, 7.5); headPath(g); hair(g, w.hair);
    if (w.glasses && body) { g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(3.5, -91.7, 1.9, 1.6, 0, 0, 7); g.fill(); g.lineWidth = .55; g.beginPath(); g.moveTo(-4.6, -92.2); g.lineTo(1.7, -91.8); g.stroke(); g.restore(); }
    g.restore();
    const arm = (h, far) => {                                               // far arm first, so the near arm overlaps the torso
      const S = [far ? -.6 : .8, -79];
      if (!h) { const a = (far ? 5 : -3) + (spec.seated ? 8 : (p.gait ? (far ? -sw : sw) * 20 : 0));
        const E = [S[0] + Math.sin(a * D) * 17, S[1] + Math.cos(a * D) * 17], Wr = [E[0] + Math.sin((a + 12) * D) * 15, E[1] + Math.cos((a + 12) * D) * 15]; return drawArm(g, S, E, Wr, w); }
      const [ex, ey, wx, wy] = ik(S, h, 17, 15.5, spec.bend || 1); drawArm(g, S, [ex, ey], [wx, wy], w);
    };
    arm(p.hand2, true); arm(p.hand1, false);
    if (spec.prop) prop(g, spec.prop, p, c, col);
    g.restore(); g.restore();
  }
}
function drawArm(g, S, E, Wr, w) {
  g.lineWidth = (w.cloth === 'shirt' ? 5.2 : 5) * w.build; g.beginPath(); g.moveTo(S[0], S[1]); g.lineTo(E[0], E[1]); g.stroke();
  g.lineWidth = (w.cloth === 'shirt' ? 3.9 : 4.4) * w.build; g.beginPath(); g.moveTo(E[0], E[1]); g.lineTo(Wr[0], Wr[1]); g.stroke();
  g.beginPath(); g.arc(Wr[0], Wr[1], 2.5, 0, 7); g.fill();
}
function prop(g, kind, p, c, col) {
  const h = p.hand1; if (!h) return;
  g.save(); g.translate(h[0], h[1]); g.rotate((p.propRot || 0) * D);
  if (kind === 'phone') { g.fillStyle = c === col ? '#0b0e14' : g.fillStyle; g.fillRect(-1.6, -4.4, 3.2, 8.8); }
  if (kind === 'cup')   { g.beginPath(); g.moveTo(-2.4, -3.6); g.lineTo(2.4, -3.6); g.lineTo(1.7, 3.6); g.lineTo(-1.7, 3.6); g.closePath(); g.fill(); }
  if (kind === 'pen')   { g.lineWidth = .8; g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 4); g.stroke(); }
  if (kind === 'folder'){ g.fillRect(-1, -6, 10, 13); }
  g.restore();
}
