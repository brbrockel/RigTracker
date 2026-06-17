import { Controller, Get, Param, Post, Body, Put, Delete } from '@nestjs/common';
import { GearService } from './gear.service';

@Controller('gear')
export class GearController {
  constructor(private readonly gearService: GearService) {}

  @Get()
  getAll() {
    return this.gearService.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.gearService.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.gearService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.gearService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gearService.remove(id);
  }
}
