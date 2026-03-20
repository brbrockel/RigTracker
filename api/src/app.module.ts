import { Module } from '@nestjs/common';
import { PacksModule } from './packs/packs.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RigsModule } from './rigs/rigs.module';
import { PeopleModule } from './people/people.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker'),
    PacksModule,
    RigsModule,
    PeopleModule
  ]
})
export class AppModule {}
