/** Procedural SoC floorplan + wafer surface. Resolution independent: patterns fade to their mean when finer than a pixel. */
export const DIE_GLSL = /* glsl */ `
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sdRect(vec2 u, vec4 r){ vec2 c=(r.xy+r.zw)*0.5; vec2 hs=(r.zw-r.xy)*0.5; vec2 q=abs(u-c)-hs; return length(max(q,0.0))+min(max(q.x,q.y),0.0); }

float lines(vec2 u, vec2 f, float w, float fw){
  vec2 aa = fw*f;
  vec2 d = abs(fract(u*f+0.5)-0.5);
  vec2 l = 1.0 - smoothstep(vec2(w)-aa, vec2(w)+aa, d);
  float v = max(l.x,l.y);
  float lod = smoothstep(0.25, 0.7, max(aa.x,aa.y));
  return mix(v, min(1.0, 4.0*w), lod);
}

float cells(vec2 u, vec2 f, float density, float fw){
  vec2 q = u*f; vec2 c = floor(q); vec2 l = fract(q);
  float r = h21(c);
  float on = step(1.0-density, r);
  vec2 aa = fw*f;
  vec2 m = smoothstep(vec2(0.07), vec2(0.07)+aa, l) * smoothstep(vec2(0.07), vec2(0.07)+aa, 1.0-l);
  float v = on*m.x*m.y*(0.35+0.65*h21(c+13.7));
  float lod = smoothstep(0.25, 0.7, max(aa.x,aa.y));
  return mix(v, density*0.5, lod);
}

vec3 tintOf(int type){
  if (type == 1) return vec3(0.10, 0.85, 0.95);
  if (type == 2) return vec3(0.55, 0.36, 1.00);
  if (type == 3) return vec3(0.22, 0.48, 1.00);
  if (type == 4) return vec3(0.92, 0.30, 1.00);
  if (type == 5) return vec3(1.00, 0.72, 0.30);
  return vec3(1.00, 0.52, 0.20);
}

vec3 applyBlock(vec3 col, vec2 u, vec4 r, int type, float fw, float t){
  float d = sdRect(u, r);
  vec3 tc = tintOf(type);
  if (d < 0.0) {
    vec2 l = (u - r.xy) / (r.zw - r.xy);
    float v = 0.0;
    if (type == 1) {
      v = l.y > 0.6 ? 0.25 + 0.75 * lines(u, vec2(700.0), 0.1, fw) : cells(u, vec2(380.0, 760.0), 0.75, fw);
      float eu = step(sdRect(l, vec4(0.08, 0.08, 0.52, 0.36)), 0.0);
      v = mix(v, 0.55 + 0.45 * cells(u, vec2(1100.0, 1100.0), 0.9, fw), eu);
      float act = 0.5 + 0.5 * sin(t * 6.0 + h21(floor(u * 8.0)) * 6.28);
      v *= 0.85 + 0.3 * act * eu;
    } else if (type == 2) {
      vec2 g = fract(l * vec2(3.0, 4.0));
      float sub = step(0.06, g.x) * step(g.x, 0.94) * step(0.07, g.y) * step(g.y, 0.93);
      v = sub * (g.y > 0.68 ? 0.3 + 0.7 * lines(u, vec2(800.0), 0.1, fw) : cells(u, vec2(520.0, 1040.0), 0.8, fw));
    } else if (type == 3) {
      vec2 g = fract(l * vec2(18.0, 3.0));
      float tile = step(0.05, g.x) * step(g.x, 0.95) * step(0.08, g.y) * step(g.y, 0.92);
      v = tile * (0.35 + 0.65 * lines(u, vec2(1200.0), 0.12, fw));
    } else if (type == 4) {
      vec2 g = fract(l * 22.0);
      float pe = step(0.14, g.x) * step(g.x, 0.86) * step(0.14, g.y) * step(g.y, 0.86);
      v = pe * (0.35 + 0.65 * cells(u, vec2(760.0), 0.7, fw));
      float wave = 0.5 + 0.5 * sin((l.x + l.y) * 14.0 - t * 5.0);
      v *= 0.8 + 0.4 * wave;
    } else if (type == 5) {
      v = cells(u, vec2(360.0, 720.0), 0.65, fw);
    } else {
      v = 0.3 + 0.7 * lines(vec2(u.x, 0.5), vec2(320.0, 1.0), 0.2, fw);
    }
    col = mix(col, tc * (0.008 + 0.055 * v), 0.94);
  }
  float e = abs(d);
  col += tc * (1.0 - smoothstep(0.0, max(fw * 1.3, 0.00012), e)) * 0.75;
  col += tc * exp(-e / max(fw * 6.0, 0.0005)) * 0.035;
  return col;
}

vec3 dieColor(vec2 u, float fw, float t){
  vec3 col = vec3(0.0025, 0.0035, 0.006);
  col += vec3(0.006, 0.010, 0.018) * cells(u, vec2(300.0, 600.0), 0.5, fw);
  col += vec3(0.010, 0.018, 0.034) * lines(u, vec2(24.0), 0.012, fw);
  float route = lines(vec2(0.5, u.y), vec2(1.0, 2600.0), 0.16, fw) * step(0.35, h21(floor(u * vec2(90.0, 2600.0))));
  float via = lines(u, vec2(1300.0, 2600.0), 0.05, fw) * step(0.8, h21(floor(u * vec2(1300.0, 2600.0)) + 3.1));
  float ring = max(max(step(u.x, 0.035), step(0.965, u.x)), max(step(u.y, 0.035), step(0.965, u.y)));
  if (ring > 0.0) {
    vec2 pl = fract(u * 58.0);
    vec2 aa = vec2(fw * 58.0);
    vec2 m = smoothstep(vec2(0.22), vec2(0.22) + aa, pl) * smoothstep(vec2(0.22), vec2(0.22) + aa, 1.0 - pl);
    col = mix(col, vec3(0.42, 0.28, 0.08) * 0.5, m.x * m.y * 0.9);
  }
  for (int i = 0; i < 8; i++) {
    float cx = float(i - (i / 4) * 4);
    float cy = float(i / 4);
    vec4 r = vec4(0.05 + cx * 0.1525, 0.05 + cy * 0.215, 0.05 + cx * 0.1525 + 0.145, 0.05 + cy * 0.215 + 0.205);
    col = applyBlock(col, u, r, 1, fw, t + float(i));
  }
  col = applyBlock(col, u, vec4(0.665, 0.05, 0.95, 0.475), 2, fw, t);
  col = applyBlock(col, u, vec4(0.05, 0.50, 0.95, 0.635), 3, fw, t);
  col = applyBlock(col, u, vec4(0.05, 0.66, 0.46, 0.95), 4, fw, t);
  col = applyBlock(col, u, vec4(0.485, 0.66, 0.70, 0.795), 5, fw, t);
  col = applyBlock(col, u, vec4(0.485, 0.815, 0.70, 0.95), 5, fw, t);
  col = applyBlock(col, u, vec4(0.725, 0.66, 0.95, 0.95), 6, fw, t);
  col += vec3(0.020, 0.030, 0.045) * route + vec3(0.05, 0.06, 0.07) * via;
  return col;
}
`;

export const WAFER_VS = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const WAFER_FS = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uCam; uniform vec3 uLight; uniform float uTime; uniform float uSheen; uniform float uR; uniform float uDetail; uniform float uFocus;
${DIE_GLSL}
void main(){
  vec2 P = vWorld.xz;
  float fw = max(length(fwidth(P)), 1e-6);
  float r = length(P);
  vec2 cell = floor(P + 0.5);
  vec2 u = P + 0.5 - cell;
  float sc = min(min(u.x, 1.0 - u.x), min(u.y, 1.0 - u.y));
  float inDie = smoothstep(0.008, 0.008 + fw, sc);
  vec2 far = abs(cell) + 0.5;
  float full = step(length(far), uR - 0.05);
  vec3 die = dieColor(u, fw, uTime + h21(cell) * 10.0) * inDie;
  die *= mix(0.2, 1.0, full);
  float isCenter = 1.0 - step(0.5, length(cell));
  die *= mix(uFocus, 1.0, isCenter);
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(uCam - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float lum = dot(die, vec3(0.3, 0.5, 0.2));
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + 1.7 * ndv + 2.5 * lum + 0.35 * r / uR + 0.06 * h21(cell)));
  vec3 L = normalize(uLight);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 600.0);
  float broad = pow(nh, 30.0);
  float wide = pow(nh, 6.0);
  vec3 col = die * uDetail + vec3(0.006, 0.007, 0.009) * (0.5 + inDie * 0.5);
  float fres = pow(1.0 - ndv, 3.0);
  col += film * film * uSheen * (0.02 + 0.22 * wide + 0.45 * broad + 0.15 * fres) * (0.45 + 0.55 * inDie);
  col += vec3(1.0, 0.97, 0.92) * spec * uSheen * 0.6;
  float rim = smoothstep(uR - 0.10, uR - 0.01, r);
  col = mix(col, vec3(0.35, 0.40, 0.48) * (0.08 + 0.9 * broad + 0.3 * fres), rim);
  float a = 1.0 - smoothstep(uR - fw * 1.5, uR + fw * 1.5, r);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(col, a);
}`;
