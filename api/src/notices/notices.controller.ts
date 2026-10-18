import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth-user.js';
import { GuestOk } from '../auth/public.decorator.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { Dismiss, EditNotice, Ids, ListQuery, NewNotice } from './notice.dto.js';
import { NoticesService } from './notices.service.js';
import type { z } from 'zod';

/**
 * /api/notices: everyone signed in reads what's for them; guests only public notices (and no
 * read state); admins post, edit and delete.
 */
@Controller('notices')
export class NoticesController {
  constructor(private readonly svc: NoticesService) {}

  @Get()
  @GuestOk()
  list(@Req() req: AuthedRequest, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.svc.list(req.authUser!, q.limit);
  }

  @Get('banners')
  @GuestOk()
  banners(@Req() req: AuthedRequest) {
    return this.svc.banners(req.authUser!);
  }

  @Post('read')
  @HttpCode(200)
  async read(@Req() req: AuthedRequest, @Body(new ZodPipe(Ids)) body: z.infer<typeof Ids>) {
    await this.svc.mark(req.authUser!, body.ids, 'read');
    return { ok: true };
  }

  @Post('dismiss')
  @HttpCode(200)
  async dismiss(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(Dismiss)) body: z.infer<typeof Dismiss>,
  ) {
    await this.svc.mark(req.authUser!, body.ids ?? [], 'dismissed');
    await this.svc.dismissKeys(req.authUser!, body.keys ?? []);
    return { ok: true };
  }

  @Post()
  @RequireRoles('admin')
  create(@Req() req: AuthedRequest, @Body(new ZodPipe(NewNotice)) body: NewNotice) {
    return this.svc.create(req.authUser!, body);
  }

  @Get(':id/phones')
  @RequireRoles('admin')
  phones(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    return this.svc.phonesFor(req.authUser!, id);
  }

  @Patch(':id')
  @RequireRoles('admin')
  update(
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(EditNotice)) body: EditNotice,
  ) {
    return this.svc.update(req.authUser!, id, body);
  }

  @Delete(':id')
  @RequireRoles('admin')
  remove(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    return this.svc.remove(req.authUser!, id);
  }
}
