import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { RigsService } from './rigs.service'

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
  create(@Body() dto: any) {
    return this.rigsService.create(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.rigsService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rigsService.remove(id)
  }
}
