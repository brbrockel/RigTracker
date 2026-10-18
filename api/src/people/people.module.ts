import { Module } from '@nestjs/common';
import { PeopleService } from './people.service.js';
import { PeopleController } from './people.controller.js';

@Module({
  providers: [PeopleService],
  controllers: [PeopleController],
})
export class PeopleModule {}
