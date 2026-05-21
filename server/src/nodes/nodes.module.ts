import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Node } from './entities/node.entity';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { XuiModule } from '../xui/xui.module';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Tunnel } from '../tunnels/entities/tunnel.entity';
import { Inbound } from '../inbounds/entities/inbound.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Node, Subscription, Tunnel, Inbound]),
    XuiModule,
  ],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService, TypeOrmModule],
})
export class NodesModule {}
