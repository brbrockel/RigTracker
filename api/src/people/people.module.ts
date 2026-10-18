import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Person, PersonSchema } from './person.schema';
import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Person.name, schema: PersonSchema }]), AuditModule],
  providers: [PeopleService],
  controllers: [PeopleController],
})
export class PeopleModule {}
