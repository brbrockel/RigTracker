import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Person, PersonSchema } from './person.schema'
import { PeopleService } from './people.service'
import { PeopleController } from './people.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Person.name, schema: PersonSchema }])],
  providers: [PeopleService],
  controllers: [PeopleController]
})
export class PeopleModule {}
