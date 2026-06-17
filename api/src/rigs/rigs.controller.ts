import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { RigsService } from './rigs.service'
import { RequireRoles } from '../auth/roles.decorator'

@Controller('rigs')
export class RigsController {
  constructor(private readonly rigsService: RigsService) {}

  @Get()
  getAll() {
    return this.rigsService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.rigsService.findOne(id)
  }

  @Post()
  @RequireRoles('editor', 'admin')
  create(@Body() dto: any) {
    return this.rigsService.create(dto)
  }

  @Put(':id')
  @RequireRoles('editor', 'admin')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.rigsService.update(id, dto)
  }

  @Delete(':id')
  @RequireRoles('admin')
  remove(@Param('id') id: string) {
    return this.rigsService.remove(id)
  }
}
