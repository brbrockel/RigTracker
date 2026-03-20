import { Controller, Get, Param, Post, Body, Put } from '@nestjs/common';
import { PacksService } from './packs.service';

@Controller('packs')
export class PacksController {
  constructor(private readonly packsService: PacksService) {}

  @Get()
  getAll() {
    return this.packsService.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.packsService.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.packsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.packsService.update(id, dto);
  }
}
