import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rig, RigSchema } from './rig.schema'
import { RigsService } from './rigs.service'
import { RigsController } from './rigs.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Rig.name, schema: RigSchema }])],
  providers: [RigsService],
  controllers: [RigsController]
})
export class RigsModule {}
