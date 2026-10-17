import { BadRequestException, Controller, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { RequireRoles } from '../auth/roles.decorator'
import { Throttle } from '@nestjs/throttler'
import { UPLOAD_LIMIT } from '../common/throttle'

const baseUploadDir = path.resolve(process.cwd(), 'uploads')
const tmpUploadDir = path.join(baseUploadDir, '.incoming')

/** Top-level folders uploads may go in; the web app sends e.g. "gear/<name>". */
const ROOT_FOLDERS = new Set(['gear', 'rigs', 'events'])
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const MAX_IMAGE_EDGE = 2560

/** File types served from /uploads. Anything else (html, svg, ...) is never written or served. */
export const SERVED_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'])

function sanitizeFolder(raw: string): string {
  const segments = raw
    .toLowerCase()
    .split('/')
    .map((s) => s.replace(/[^a-z0-9\-_ ]/g, '-').trim())
    .filter(Boolean)
  if (!segments.length || !ROOT_FOLDERS.has(segments[0])) return ''
  const cleaned = segments.slice(0, 2).join('/')
  // guard against path traversal
  const resolved = path.resolve(baseUploadDir, cleaned)
  if (!resolved.startsWith(baseUploadDir + path.sep)) return ''
  return cleaned
}

type Sniffed = { kind: 'image' } | { kind: 'video'; ext: '.mp4' | '.mov' | '.webm' }

/** Identifies a file by its first bytes, not by the name or type the browser claims. */
function sniff(head: Buffer): Sniffed | null {
  if (head.length < 12) return null
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image' }
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image' }
  if (head.subarray(0, 4).toString('latin1') === 'GIF8') return { kind: 'image' }
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return { kind: 'image' }
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { kind: 'video', ext: '.webm' }
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1')
    if (brand === 'avif' || brand === 'avis') return { kind: 'image' }
    if (brand === 'qt  ') return { kind: 'video', ext: '.mov' }
    if (/^(isom|iso\d|mp4\d|avc1|M4V |M4VP|dash|3gp\d|3g2\w|MSNV)$/.test(brand)) return { kind: 'video', ext: '.mp4' }
  }
  return null
}

function readHead(file: string): Buffer {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(16)
    const n = fs.readSync(fd, buf, 0, 16, 0)
    return buf.subarray(0, n)
  } finally {
    fs.closeSync(fd)
  }
}

@Controller('uploads')
export class UploadsController {
  @Post('image')
  @RequireRoles('user', 'admin')
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(tmpUploadDir, { recursive: true })
        cb(null, tmpUploadDir)
      },
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  }))
  async uploadImage(@UploadedFile() file: any, @Query('folder') folder?: string) {
    if (!file?.path) {
      throw new BadRequestException('Media file is required')
    }
    try {
      const type = sniff(readHead(file.path))
      if (!type) {
        throw new BadRequestException('Only JPEG, PNG, GIF, WebP or AVIF images and MP4, MOV or WebM videos can be uploaded')
      }

      const safe = typeof folder === 'string' && folder ? sanitizeFolder(folder) : ''
      const dir = safe ? path.join(baseUploadDir, safe) : baseUploadDir
      fs.mkdirSync(dir, { recursive: true })
      const id = randomUUID()

      let filename: string
      if (type.kind === 'image') {
        if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Images can be up to 30 MB')
        filename = `${id}.jpg`
        try {
          // Re-encoding turns the photo upright and drops all metadata, including GPS location.
          await sharp(file.path, { limitInputPixels: 80_000_000 })
            .rotate()
            .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toFile(path.join(dir, filename))
        } catch {
          throw new BadRequestException('That image could not be read')
        }
      } else {
        filename = `${id}${type.ext}`
        fs.renameSync(file.path, path.join(dir, filename))
      }

      return { url: safe ? `/uploads/${safe}/${filename}` : `/uploads/${filename}` }
    } finally {
      fs.rmSync(file.path, { force: true })
    }
  }
}
