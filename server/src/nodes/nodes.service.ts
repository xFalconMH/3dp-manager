import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNodeDto, UpdateNodeDto } from './dto/node.dto';
import { Node, NodeAuthType, NodeProtocol } from './entities/node.entity';
import { XuiService } from '../xui/xui.service';

@Injectable()
export class NodesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepo: Repository<Node>,
    private readonly xuiService: XuiService,
  ) {}

  findAll() {
    return this.nodesRepo.find({ order: { isMain: 'DESC', createdAt: 'DESC' } });
  }

  async findOneWithSecrets(id: string) {
    const node = await this.nodesRepo
      .createQueryBuilder('node')
      .addSelect('node.password')
      .addSelect('node.token')
      .where('node.id = :id', { id })
      .getOne();

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    return node;
  }

  async getDefaultNode() {
    return this.nodesRepo
      .createQueryBuilder('node')
      .addSelect('node.password')
      .addSelect('node.token')
      .where('node.isMain = :isMain', { isMain: true })
      .getOne();
  }

  async create(dto: CreateNodeDto) {
    this.assertCredentials(dto);

    const node = this.nodesRepo.create({
      ...dto,
      url: this.normalizeUrl(dto.url),
      isMain: dto.isMain ?? false,
    });

    if ((await this.nodesRepo.count()) === 0) {
      node.isMain = true;
    }

    if (node.isMain) {
      await this.clearMainNode();
    }

    return this.nodesRepo.save(node);
  }

  async update(id: string, dto: UpdateNodeDto) {
    const node = await this.findOneWithSecrets(id);
    const nextAuthType = dto.authType ?? node.authType;

    if (nextAuthType === NodeAuthType.Password) {
      const login = dto.login ?? node.login;
      const password = dto.password ?? node.password;
      if (!login || !password) {
        throw new BadRequestException('Login and password are required');
      }
    }

    if (nextAuthType === NodeAuthType.Token) {
      const token = dto.token ?? node.token;
      if (!token) {
        throw new BadRequestException('Token is required');
      }
    }

    Object.assign(node, dto);
    if (dto.url) {
      node.url = this.normalizeUrl(dto.url);
    }

    if (dto.isMain) {
      await this.clearMainNode(id);
      node.isMain = true;
    }

    return this.nodesRepo.save(node);
  }

  async remove(id: string) {
    const node = await this.findOneWithSecrets(id);
    if (node.isMain && (await this.nodesRepo.count()) > 1) {
      throw new BadRequestException('Select another main node before deleting');
    }

    await this.nodesRepo.remove(node);
    const main = await this.getDefaultNode();
    if (!main) {
      const fallback = await this.nodesRepo.findOne({ where: {} });
      if (fallback) {
        fallback.isMain = true;
        await this.nodesRepo.save(fallback);
      }
    }

    return { success: true };
  }

  async setMain(id: string) {
    const node = await this.findOneWithSecrets(id);
    await this.clearMainNode(id);
    node.isMain = true;
    return this.nodesRepo.save(node);
  }

  async checkConnection(id: string) {
    const node = await this.findOneWithSecrets(id);
    const status = await this.xuiService.checkNodeConnection(node);
    return { success: status.success, version: status.version };
  }

  async syncFromMain() {
    const main = await this.getDefaultNode();
    if (!main) {
      throw new BadRequestException('Main node is not configured');
    }

    const discovered = await this.xuiService.getNodes(main);
    const synced: Node[] = [];

    for (const item of discovered) {
      if (!item.host || !item.port) {
        continue;
      }
      const url = `${item.protocol}://${item.host}:${item.port}`.replace(
        /\/+$/,
        '',
      );

      const existing = await this.nodesRepo.findOne({
        where: { url },
      });

      if (existing) {
        existing.name = item.name || existing.name;
        existing.version = item.version || existing.version;
        synced.push(await this.nodesRepo.save(existing));
        continue;
      }

      synced.push(
        await this.nodesRepo.save(
          this.nodesRepo.create({
            name: item.name || item.host,
            url,
            host: item.host,
            port: item.port,
            protocol:
              item.protocol === NodeProtocol.Http
                ? NodeProtocol.Http
                : NodeProtocol.Https,
            authType: main.authType,
            login: main.login,
            password: main.password,
            token: main.token,
            version: item.version,
            isMain: false,
          }),
        ),
      );
    }

    return { success: true, count: synced.length, nodes: synced };
  }

  private assertCredentials(dto: CreateNodeDto) {
    if (dto.authType === NodeAuthType.Password && (!dto.login || !dto.password)) {
      throw new BadRequestException('Login and password are required');
    }

    if (dto.authType === NodeAuthType.Token && !dto.token) {
      throw new BadRequestException('Token is required');
    }
  }

  private async clearMainNode(exceptId?: string) {
    const qb = this.nodesRepo
      .createQueryBuilder()
      .update(Node)
      .set({ isMain: false })
      .where('isMain = :isMain', { isMain: true });

    if (exceptId) {
      qb.andWhere('id != :exceptId', { exceptId });
    }

    await qb.execute();
  }

  async checkPayload(dto: CreateNodeDto) {
    this.assertCredentials(dto);
    const node = this.nodesRepo.create({
      ...dto,
      url: this.normalizeUrl(dto.url),
    });
    const status = await this.xuiService.checkNodeConnection(node);
    return { success: status.success, version: status.version };
  }

  private normalizeUrl(url: string) {
    return url.trim().replace(/\/+$/, '');
  }
}
