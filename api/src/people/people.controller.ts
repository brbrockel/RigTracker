import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { PeopleService } from './people.service'

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  getAll() {
    return this.peopleService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.peopleService.findOne(id)
  }

  @Post()
  create(@Body() dto: any) {
    return this.peopleService.create(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.peopleService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.peopleService.remove(id)
  }
}
