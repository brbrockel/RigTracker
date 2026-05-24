import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PacksController } from './packs.controller';
import { PacksService } from './packs.service';
import { Pack, PackSchema } from './pack.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Pack.name, schema: PackSchema }])],
  controllers: [PacksController],
  providers: [PacksService]
})
export class PacksModule {}
