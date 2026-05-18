import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Node } from './entities/node.entity';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { XuiModule } from '../xui/xui.module';

@Module({
  imports: [TypeOrmModule.forFeature([Node]), XuiModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService, TypeOrmModule],
})
export class NodesModule {}
