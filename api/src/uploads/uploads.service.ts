import { BadRequestException, Injectable } from '@nestjs/common';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { MediaKind } from '../db/schema.js';
import { uploadsDir } from '../common/uploads-dir.js';

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2560;

/** File types served from /uploads. Anything else (html, svg, ...) is never written or served. */
export const SERVED_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.mov',
  '.webm',
]);

/**
 * Multer options for one uploaded file: written to UPLOADS_DIR/.incoming under a random name
 * (never served: dot folders are refused), then checked and moved by UploadsService.store.
 */
export function incomingFileOptions(): Pick<multer.Options, 'storage' | 'limits'> {
  return {
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(uploadsDir(), '.incoming');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 10_000 },
  };
}

type Sniffed = { kind: 'image' } | { kind: 'video'; ext: '.mp4' | '.mov' | '.webm' };

/** Identifies a file by its first bytes, not by the name or type the browser claims. */
function sniff(head: Buffer): Sniffed | null {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image' };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { kind: 'image' };
  if (head.subarray(0, 4).toString('latin1') === 'GIF8') return { kind: 'image' };
  if (
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { kind: 'image' };
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return { kind: 'video', ext: '.webm' };
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return { kind: 'image' };
    if (brand === 'qt  ') return { kind: 'video', ext: '.mov' };
    if (/^(isom|iso\d|mp4\d|avc1|M4V |M4VP|dash|3gp\d|3g2\w|MSNV)$/.test(brand))
      return { kind: 'video', ext: '.mp4' };
  }
  return null;
}

function readHead(file: string): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** Where an /uploads/... URL's file is, or null if it isn't one or points outside UPLOADS_DIR. */
export function uploadFilePath(url: string): string | null {
  if (!url.startsWith('/uploads/')) return null;
  const base = uploadsDir();
  let rel: string;
  try {
    rel = decodeURIComponent(url.slice('/uploads/'.length).split('?')[0]!);
  } catch {
    return null;
  }
  const file = path.resolve(base, rel);
  return file.startsWith(base + path.sep) ? file : null;
}

/**
 * The upload pipeline: files are checked by content (JPEG, PNG, GIF, WebP or AVIF images; MP4,
 * MOV or WebM videos), images are re-encoded to JPEG (upright, no metadata), and the server
 * picks the file name.
 */
@Injectable()
export class UploadsService {
  /**
   * Checks the uploaded file at `incoming` and stores it as UPLOADS_DIR/<folder>/<uuid>.<ext>.
   * `folder` is chosen by the caller (never by the client). The incoming file is always removed.
   */
  async store(
    incoming: string,
    size: number,
    folder: string,
  ): Promise<{ url: string; file: string; kind: MediaKind }> {
    try {
      const type = sniff(readHead(incoming));
      if (!type) {
        throw new BadRequestException(
          'Only JPEG, PNG, GIF, WebP or AVIF images and MP4, MOV or WebM videos can be uploaded',
        );
      }
      const base = uploadsDir();
      const dir = path.resolve(base, folder);
      if (!dir.startsWith(base + path.sep)) throw new Error(`Bad upload folder: ${folder}`);
      fs.mkdirSync(dir, { recursive: true });
      const id = randomUUID();

      let filename: string;
      if (type.kind === 'image') {
        if (size > MAX_IMAGE_BYTES) throw new BadRequestException('Images can be up to 30 MB');
        filename = `${id}.jpg`;
        try {
          // Re-encoding turns the photo upright and drops all metadata, including GPS location.
          await sharp(incoming, { limitInputPixels: 80_000_000 })
            .rotate()
            .resize({
              width: MAX_IMAGE_EDGE,
              height: MAX_IMAGE_EDGE,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85, mozjpeg: true })
            .toFile(path.join(dir, filename));
        } catch {
          throw new BadRequestException('That image could not be read');
        }
      } else {
        filename = `${id}${type.ext}`;
        fs.renameSync(incoming, path.join(dir, filename));
      }
      const rel = path.relative(base, path.join(dir, filename)).split(path.sep).join('/');
      return {
        url: `/uploads/${rel}`,
        file: path.join(dir, filename),
        kind: type.kind === 'image' ? 'photo' : 'video',
      };
    } finally {
      fs.rmSync(incoming, { force: true });
    }
  }

  /** Deletes an uploaded file (if it's one of ours), and any folders that leaves empty. */
  removeFile(url: string): void {
    const file = uploadFilePath(url);
    if (!file) return;
    try {
      fs.rmSync(file, { force: true });
    } catch {
      return; // A file that can't be removed doesn't stop the change it belongs to.
    }
    const base = uploadsDir();
    let dir = path.dirname(file);
    while (dir.startsWith(base + path.sep)) {
      try {
        if (fs.readdirSync(dir).length) break;
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
}
