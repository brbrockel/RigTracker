import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service.js';

/** The upload pipeline (content checks, re-encoding, storage); POST /api/media uses it. */
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
