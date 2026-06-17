import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import * as fs from 'fs'
import * as path from 'path'

const uploadDir = path.resolve(process.cwd(), 'uploads')

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
}

@Controller('uploads')
export class UploadsController {
  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        ensureUploadDir()
        cb(null, uploadDir)
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase()
        const safeExt = ext && ext.length <= 6 ? ext : '.jpg'
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        cb(null, `${unique}${safeExt}`)
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        cb(new BadRequestException('Only image uploads are allowed'), false)
        return
      }
      cb(null, true)
    }
  }))
  uploadImage(@UploadedFile() file: any) {
    if (!file || !file.filename) {
      throw new BadRequestException('Image file is required')
    }
    return { url: `/uploads/${file.filename}` }
  }
}
