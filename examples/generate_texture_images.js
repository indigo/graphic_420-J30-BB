// ============================================================
//  generate_texture_images.js
//  Génère les PNG des textures procédurales sans navigateur.
//  Port JS des fonctions GLSL (Perlin Gustavson, Worley, FBM).
//  PNG encodé à la main avec zlib (pas de dépendance externe).
// ============================================================
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SIZE = 512;          // résolution carrée
const OUT_DIR = join(process.cwd(), 'cours', 'images');

mkdirSync(OUT_DIR, { recursive: true });

// ============================================================
//  HASH & PERLIN (port JS de l'implémentation Gustavson/Ashima)
// ============================================================
function mod289(x) { return x - Math.floor(x / 289) * 289; }
function permute(x) { return mod289((x * 34 + 1) * x); }
function taylorInvSqrt(r) { return 1.79284291400159 - 0.85373472095314 * r; }

function perlinNoise(px, py) {
    const Pix = Math.floor(px), Piy = Math.floor(py);
    const Pfx = px - Pix, Pfy = py - Piy;

    // 4 coins
    const corners = [
        [Pix,     Piy    ], [Pix + 1, Piy    ],
        [Pix,     Piy + 1], [Pix + 1, Piy + 1],
    ];
    const offsets = [
        [Pfx,     Pfy    ], [Pfx - 1, Pfy    ],
        [Pfx,     Pfy - 1], [Pfx - 1, Pfy - 1],
    ];

    // Gradients via permutation hash
    const grads = corners.map(([cx, cy]) => {
        const i = permute(permute(mod289(cx)) + mod289(cy));
        let gx = (i % 41) / 41 * 2 - 1;
        let gy = Math.abs(gx) - 0.5;
        const tx = Math.floor(gx + 0.5);
        gx = gx - tx;
        // Normalize
        const len = Math.sqrt(gx * gx + gy * gy);
        return [gx / len, gy / len];
    });

    // Dot products
    const dots = grads.map((g, i) => g[0] * offsets[i][0] + g[1] * offsets[i][1]);

    // Quintic fade
    const fx = Pfx * Pfx * Pfx * (Pfx * (Pfx * 6 - 15) + 10);
    const fy = Pfy * Pfy * Pfy * (Pfy * (Pfy * 6 - 15) + 10);

    // Bilinear interpolation
    const nx0 = dots[0] + (dots[1] - dots[0]) * fx;
    const nx1 = dots[2] + (dots[3] - dots[2]) * fx;
    const nxy = nx0 + (nx1 - nx0) * fy;

    return 2.3 * nxy * 0.5 + 0.5;
}

// ============================================================
//  WORLEY NOISE
// ============================================================
function hash22(px, py) {
    const x = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
    const y = Math.sin(px * 269.5 + py * 183.3) * 43758.5453;
    return [x - Math.floor(x), y - Math.floor(y)];
}

function worleyNoise(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    let minDist = 1.0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const [hx, hy] = hash22(ix + dx, iy + dy);
            const diffX = dx + hx - fx;
            const diffY = dy + hy - fy;
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);
            if (dist < minDist) minDist = dist;
        }
    }
    return minDist;
}

// ============================================================
//  FBM
// ============================================================
function fbm(px, py, octaves = 5) {
    let value = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * perlinNoise(px * frequency, py * frequency);
        frequency *= 2;
        amplitude *= 0.5;
    }
    return value;
}

// ============================================================
//  TEXTURES — port JS des fonctions du fragment shader
// ============================================================
function marble(uvx, uvy) {
    const n = fbm(uvx * 2, uvy * 2);
    const vein = Math.abs(Math.sin((uvx + n * 1.5) * Math.PI));
    const light = [0.95, 0.95, 0.92];
    const dark  = [0.3, 0.35, 0.45];
    return [
        dark[0] + (light[0] - dark[0]) * vein,
        dark[1] + (light[1] - dark[1]) * vein,
        dark[2] + (light[2] - dark[2]) * vein,
    ];
}

function wood(uvx, uvy) {
    const n = perlinNoise(uvx * 3, uvy * 3);
    const rings = Math.abs(Math.sin((uvx * 8 + n * 5) * Math.PI));
    const light = [0.8, 0.6, 0.35];
    const dark  = [0.4, 0.25, 0.12];
    return [
        dark[0] + (light[0] - dark[0]) * rings,
        dark[1] + (light[1] - dark[1]) * rings,
        dark[2] + (light[2] - dark[2]) * rings,
    ];
}

function dissolve(uvx, uvy, threshold = 0.5) {
    const n = fbm(uvx * 3, uvy * 3);
    const mask = n >= threshold ? 1 : 0;
    const edge = smoothstep(threshold - 0.05, threshold, n) - smoothstep(threshold, threshold + 0.05, n);
    const base = [0.1, 0.1, 0.15];
    const solid = [0.9, 0.9, 0.95];
    return [
        base[0] + (solid[0] - base[0]) * mask + edge * 1.0,
        base[1] + (solid[1] - base[1]) * mask + edge * 0.5,
        base[2] + (solid[2] - base[2]) * mask + edge * 0.1,
    ];
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function scales(uvx, uvy) {
    const w = worleyNoise(uvx * 4, uvy * 4);
    const border = 1 - smoothstep(0, 0.15, w);
    const base = [
        0.2 + (0.4 - 0.2) * w,
        0.5 + (0.7 - 0.5) * w,
        0.6 + (0.8 - 0.6) * w,
    ];
    return [
        base[0] + (0.05 - base[0]) * border,
        base[1] + (0.1  - base[1]) * border,
        base[2] + (0.15 - base[2]) * border,
    ];
}

function terrain(uvx, uvy) {
    const h = fbm(uvx * 2, uvy * 2);
    if (h < 0.45)      return [0.15, 0.25, 0.5];
    else if (h < 0.5)  return [0.2, 0.35, 0.6];
    else if (h < 0.55) return [0.85, 0.8, 0.6];
    else if (h < 0.65) return [0.3, 0.5, 0.2];
    else if (h < 0.75) return [0.25, 0.4, 0.15];
    else if (h < 0.85) return [0.4, 0.35, 0.25];
    else               return [0.95, 0.95, 0.98];
}

// ============================================================
//  PNG ENCODER — minimal, sans dépendance externe
// ============================================================
function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crcData = Buffer.concat([typeBytes, data]);
    crcBuf.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function encodePNG(width, height, rgbBuffer) {
    // Signature
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // color type (RGB)
    ihdr[10] = 0;   // compression
    ihdr[11] = 0;   // filter
    ihdr[12] = 0;   // interlace
    // IDAT — filter byte (0 = none) per row + RGB data
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;  // filter: none
        rgbBuffer.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    const compressed = deflateSync(raw);
    // IEND
    return Buffer.concat([
        sig,
        writeChunk('IHDR', ihdr),
        writeChunk('IDAT', compressed),
        writeChunk('IEND', Buffer.alloc(0)),
    ]);
}

// ============================================================
//  GÉNÉRATION — rendu CPU de chaque texture
// ============================================================
function renderTexture(name, fn, scale = 4.0) {
    const buf = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const uvx = (x / SIZE) * scale;
            const uvy = (y / SIZE) * scale;
            const [r, g, b] = fn(uvx, uvy);
            const idx = (y * SIZE + x) * 3;
            buf[idx]     = Math.max(0, Math.min(255, Math.round(r * 255)));
            buf[idx + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
            buf[idx + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
        }
    }
    const png = encodePNG(SIZE, SIZE, buf);
    const outPath = join(OUT_DIR, `texture_${name}.png`);
    writeFileSync(outPath, png);
    console.log(`  ✓ ${outPath} (${(png.length / 1024).toFixed(0)} KB)`);
}

console.log('Génération des textures procédurales...');
renderTexture('marble',   marble);
renderTexture('wood',     wood);
renderTexture('dissolve', (x, y) => dissolve(x, y, 0.5));
renderTexture('scales',   scales);
renderTexture('terrain',  terrain);
console.log('Terminé.');
