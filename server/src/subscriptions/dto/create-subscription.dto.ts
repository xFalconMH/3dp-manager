import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  ValidateIf,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InboundConfigDto {
  @IsString()
  type: string;

  @IsOptional()
  port?: number | string;

  @IsString()
  @IsOptional()
  sni?: string;

  @IsString()
  @IsOptional()
  link?: string;

  @IsUUID()
  @IsOptional()
  nodeId?: string;

  @ValidateIf((dto: InboundConfigDto) => dto.relayServerId !== undefined)
  @Type(() => Number)
  @IsInt()
  relayServerId?: number;
}

export class CreateSubscriptionDto {
  @IsString()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundConfigDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsOptional()
  inboundsConfig?: InboundConfigDto[];

  @IsBoolean()
  @IsOptional()
  isAutoRotationEnabled?: boolean;

  @IsUUID()
  @IsOptional()
  nodeId?: string;

  @ValidateIf((dto: CreateSubscriptionDto) => dto.relayServerId !== undefined)
  @Type(() => Number)
  @IsInt()
  relayServerId?: number;
}
