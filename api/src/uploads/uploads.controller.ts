import { BadRequestException, Controller, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import * as fs from 'fs'
import * as path from 'path'

const baseUploadDir = path.resolve(process.cwd(), 'uploads')

function sanitizeFolder(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\-_ /]/g, '-')   // only safe chars
    .replace(/\.{2,}/g, '')             // remove ..
    .replace(/^\/+|\/+$/g, '')          // strip leading/trailing slashes
    .replace(/\/+/g, '/')               // collapse double slashes
    .trim()
  // guard against path traversal
  const resolved = path.resolve(baseUploadDir, cleaned)
  if (!resolved.startsWith(baseUploadDir + path.sep) && resolved !== baseUploadDir) return ''
  return cleaned
}

function resolveUploadDir(folder?: string): string {
  if (!folder) return baseUploadDir
  const safe = sanitizeFolder(folder)
  if (!safe) return baseUploadDir
  const dir = path.join(baseUploadDir, safe)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

@Controller('uploads')
export class UploadsController {
  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req: any, _file, cb) => {
        const dir = resolveUploadDir(req.query?.folder)
        cb(null, dir)
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase()
        const safeExt = ext && ext.length <= 6 ? ext : '.jpg'
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        cb(null, `${unique}${safeExt}`)
      }
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const isImage = !!file.mimetype && file.mimetype.startsWith('image/')
      const isVideo = !!file.mimetype && file.mimetype.startsWith('video/')
      if (!isImage && !isVideo) {
        cb(new BadRequestException('Only image and video uploads are allowed'), false)
        return
      }
      cb(null, true)
    }
  }))
  uploadImage(@UploadedFile() file: any, @Query('folder') folder?: string) {
    if (!file || !file.filename) {
      throw new BadRequestException('Media file is required')
    }
    const safe = folder ? sanitizeFolder(folder) : ''
    const urlPath = safe ? `/uploads/${safe}/${file.filename}` : `/uploads/${file.filename}`
    return { url: urlPath }
  }
}
