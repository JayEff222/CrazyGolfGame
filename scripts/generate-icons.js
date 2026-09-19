#!/usr/bin/env node
/**
 * Generates the PWA icons as PNGs with no image library.
 *
 * There is no design tool on this machine and the icons are simple flat shapes,
 * so we encode the PNG by hand: raw RGBA scanlines, deflate, and the three
 * chunks a valid PNG needs. Re-run if the brand colours change.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
mkdirSync(publicDir, { recursive: true })

const FAIRWAY = [4, 106, 56]
const BALL = [244, 247, 242]
const FLAG = [242, 169, 0]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Flat icon: green ground, a ball low-left, a flagstick leaning right. */
const pixel = (x, y, size) => {
  const cx = size / 2
  const ballR = size * 0.13
  const ballX = size * 0.34
  const ballY = size * 0.70
  if ((x - ballX) ** 2 + (y - ballY) ** 2 <= ballR ** 2) return BALL

  const poleX = size * 0.64
  const poleTop = size * 0.20
  const poleBot = size * 0.78
  const poleW = size * 0.035
  if (Math.abs(x - poleX) <= poleW / 2 && y >= poleTop && y <= poleBot) return BALL

  // Pennant: a triangle hanging left off the top of the pole.
  const flagH = size * 0.17
  if (y >= poleTop && y <= poleTop + flagH) {
    const t = (y - poleTop) / flagH
    const reach = size * 0.22 * (1 - Math.abs(t - 0.5) * 2)
    if (x <= poleX && x >= poleX - reach) return FLAG
  }
  void cx
  return FAIRWAY
}

const png = (size) => {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
      raw[o++] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const file = join(publicDir, `icon-${size}.png`)
  writeFileSync(file, png(size))
  console.log(`wrote public/icon-${size}.png`)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#046A38"/>
  <circle cx="22" cy="45" r="8" fill="#F4F7F2"/>
  <rect x="40" y="13" width="2.5" height="37" fill="#F4F7F2"/>
  <path d="M40 13 L26 18 L40 24 Z" fill="#F2A900"/>
</svg>`
writeFileSync(join(publicDir, 'favicon.svg'), svg)
console.log('wrote public/favicon.svg')
