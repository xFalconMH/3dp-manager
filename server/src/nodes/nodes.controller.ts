import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { NodesService } from './nodes.service';

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  findAll() {
    return this.nodesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateNodeDto) {
    return this.nodesService.create(dto);
  }

  @Post('check')
  checkPayload(@Body() dto: CreateNodeDto) {
    return this.nodesService.checkPayload(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nodesService.remove(id);
  }

  @Post(':id/main')
  setMain(@Param('id') id: string) {
    return this.nodesService.setMain(id);
  }

  @Post(':id/check')
  check(@Param('id') id: string) {
    return this.nodesService.checkConnection(id);
  }

  @Post('sync/main')
  syncFromMain() {
    return this.nodesService.syncFromMain();
  }
}
