import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, isMaskable = false) {
  // CRC table for PNG chunks
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, combined, crcBuf]);
  }

  // Raw RGBA pixels with 1 filter byte (0x00) per row
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowBytes);

  const cx = width / 2;
  const cy = height / 2;
  const rCorner = isMaskable ? 0 : width * 0.22;

  // Render pixels
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    rawData[rowStart] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pIdx = rowStart + 1 + x * 4;

      // Check rounded rect corner if not maskable
      let insideBg = true;
      if (!isMaskable && rCorner > 0) {
        let dx = 0;
        let dy = 0;
        if (x < rCorner) dx = rCorner - x;
        else if (x > width - rCorner) dx = x - (width - rCorner);
        if (y < rCorner) dy = rCorner - y;
        else if (y > height - rCorner) dy = y - (height - rCorner);

        if (dx > 0 && dy > 0) {
          if (dx * dx + dy * dy > rCorner * rCorner) {
            insideBg = false;
          }
        }
      }

      if (!insideBg) {
        // Transparent
        rawData[pIdx] = 0;
        rawData[pIdx + 1] = 0;
        rawData[pIdx + 2] = 0;
        rawData[pIdx + 3] = 0;
        continue;
      }

      // Base Burgundy background: #800020
      let r = 0x80;
      let g = 0x00;
      let b = 0x20;
      let a = 255;

      // Subtle gradient
      const grad = 1.0 - (y / height) * 0.2;
      r = Math.min(255, Math.floor(r * grad));

      // Shield boundaries (safe zone center)
      const scale = width / 512;
      const nx = (x - cx) / scale; // -256 to +256
      const ny = (y - cy) / scale; // -256 to +256

      // Shield coordinates: top Y: -70, bottom tip Y: 150, width ~120
      const inShieldTop = ny >= -80 && ny <= 40 && Math.abs(nx) <= (115 - (ny + 80) * 0.1);
      const inShieldBottom = ny > 40 && ny <= 150 && Math.abs(nx) <= (103 * (1 - (ny - 40) / 110));

      if (inShieldTop || inShieldBottom) {
        // White / light grey shield
        r = 250;
        g = 250;
        b = 252;

        // Padlock inside shield
        // Lock body: ny: 20 to 80, |nx| <= 42
        if (ny >= 20 && ny <= 80 && Math.abs(nx) <= 42) {
          r = 0x80;
          g = 0x00;
          b = 0x20;

          // Keyhole
          const dKey = Math.hypot(nx, ny - 45);
          if (dKey <= 8) {
            r = 255;
            g = 255;
            b = 255;
          } else if (ny >= 45 && ny <= 65 && Math.abs(nx) <= 4.5) {
            r = 255;
            g = 255;
            b = 255;
          }
        }
        // Lock shackle: ny: -20 to 20, loop around nx
        const dShackle = Math.hypot(nx, ny - 2);
        if (ny <= 20 && Math.abs(nx) <= 30 && Math.abs(nx) >= 16 && ny >= -22) {
          r = 0x80;
          g = 0x00;
          b = 0x20;
        }
      }

      rawData[pIdx] = r;
      rawData[pIdx + 1] = g;
      rawData[pIdx + 2] = b;
      rawData[pIdx + 3] = a;
    }
  }

  // Deflate rawData
  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression: Deflate (0)
  ihdr[11] = 0; // Filter: Adaptive (0)
  ihdr[12] = 0; // Interlace: None (0)

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Generate icons
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), createPNG(192, 192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), createPNG(512, 512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), createPNG(512, 512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createPNG(180, 180, false));
fs.writeFileSync(path.join(outDir, 'favicon.ico'), createPNG(64, 64, false));

console.log('Successfully generated all PWA icons in public/');
