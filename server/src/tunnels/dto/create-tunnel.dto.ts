import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTunnelDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsUUID()
  @IsOptional()
  nodeId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  sshPort: number;

  @IsString()
  @MinLength(1)
  username: string;

  @ValidateIf((dto: CreateTunnelDto) => !dto.privateKey)
  @IsString()
  password?: string;

  @ValidateIf((dto: CreateTunnelDto) => !dto.password)
  @IsString()
  privateKey?: string;

  @IsString()
  @IsOptional()
  domain?: string;
}
