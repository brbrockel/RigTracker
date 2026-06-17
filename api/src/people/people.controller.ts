import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { PeopleService } from './people.service'
import { RequireRoles } from '../auth/roles.decorator'

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
  @RequireRoles('editor', 'admin')
  create(@Body() dto: any) {
    return this.peopleService.create(dto)
  }

  @Put(':id')
  @RequireRoles('editor', 'admin')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.peopleService.update(id, dto)
  }

  @Delete(':id')
  @RequireRoles('admin')
  remove(@Param('id') id: string) {
    return this.peopleService.remove(id)
  }
}
