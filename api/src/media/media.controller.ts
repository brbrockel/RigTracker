import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import * as fs from 'node:fs';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedRequest } from '../auth/auth-user.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import { GuestOk } from '../auth/public.decorator.js';
import { UPLOAD_LIMIT } from '../common/throttle.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { incomingFileOptions } from '../uploads/uploads.service.js';
import { MediaCreateBody, MediaPatchBody, MediaQuery } from './media.dto.js';
import { MediaService, OWNER_RESOURCE, type MediaOwner } from './media.service.js';

/** Photos and videos of rigs, gear and events. Changes are logged as updates of the owner. */
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly auditService: AuditService,
  ) {}

  private audit(
    req: AuthedRequest,
    owner: MediaOwner,
    change: 'added' | 'removed' | 'cover' | 'caption',
    url: string,
  ) {
    return this.auditService.log({
      action: 'UPDATE',
      resource: OWNER_RESOURCE[owner.type],
      resourceId: owner.id,
      resourceName: owner.name,
      actor: req.authUser,
      details: { media: change, url },
    });
  }

  @Get()
  @GuestOk()
  list(@Query(new ZodPipe(MediaQuery)) q: MediaQuery) {
    return this.mediaService.list(q.ownerType, q.ownerId);
  }

  /** multipart/form-data: file, ownerType, ownerId, caption (optional). */
  @Post()
  @RequireRoles('user', 'admin')
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(FileInterceptor('file', incomingFileOptions()))
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Req() req: AuthedRequest,
  ) {
    let incoming = file?.path;
    try {
      // Checked here rather than in a pipe so the incoming file is always cleaned up.
      const dto = new ZodPipe(MediaCreateBody).transform(body);
      if (!file?.path) throw new BadRequestException('Media file is required');
      incoming = undefined; // add() takes care of it from here.
      const { item, owner } = await this.mediaService.add({
        type: dto.ownerType,
        ownerId: dto.ownerId,
        incoming: file.path,
        size: file.size,
        caption: dto.caption,
        uploadedBy: req.authUser?.id,
      });
      await this.audit(req, owner, 'added', item.url);
      return item;
    } finally {
      if (incoming) fs.rmSync(incoming, { force: true });
    }
  }

  @Patch(':id')
  @RequireRoles('user', 'admin')
  async update(
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(MediaPatchBody)) dto: MediaPatchBody,
    @Req() req: AuthedRequest,
  ) {
    const { item, owner, coverChanged, captionChanged } = await this.mediaService.update(id, dto);
    if (coverChanged) await this.audit(req, owner, 'cover', item.url);
    if (captionChanged) await this.audit(req, owner, 'caption', item.url);
    return item;
  }

  @Delete(':id')
  @RequireRoles('user', 'admin')
  async remove(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    const { item, owner } = await this.mediaService.remove(id);
    await this.audit(req, owner, 'removed', item.url);
    return { deleted: true };
  }
}
