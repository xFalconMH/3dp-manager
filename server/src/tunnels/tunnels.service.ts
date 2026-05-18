import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tunnel } from './entities/tunnel.entity';
import { SshService } from './ssh.service';
import { Setting } from '../settings/entities/setting.entity';
import { Node } from '../nodes/entities/node.entity';
import { CreateTunnelDto } from './dto/create-tunnel.dto';

@Injectable()
export class TunnelsService {
  private readonly logger = new Logger(TunnelsService.name);

  constructor(
    @InjectRepository(Tunnel) private tunnelRepo: Repository<Tunnel>,
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    @InjectRepository(Node) private nodeRepo: Repository<Node>,
    private sshService: SshService,
  ) {}

  async create(createTunnelDto: CreateTunnelDto) {
    const node = createTunnelDto.nodeId
      ? await this.nodeRepo.findOne({ where: { id: createTunnelDto.nodeId } })
      : await this.nodeRepo.findOne({ where: { isMain: true } });

    if (!node) {
      throw new HttpException('Node not found', HttpStatus.BAD_REQUEST);
    }

    const ip = this.getNodeAddress(node);
    if (!ip) {
      throw new HttpException(
        'Cannot determine relay IP from node URL',
        HttpStatus.BAD_REQUEST,
      );
    }

    const tunnel = this.tunnelRepo.create({
      ...createTunnelDto,
      ip,
      node,
      nodeId: node.id,
    });
    return this.tunnelRepo.save(tunnel);
  }

  async findAll() {
    return this.tunnelRepo.find({ relations: ['node'] });
  }

  async remove(id: number, deleteForwarding = false) {
    if (deleteForwarding) {
      await this.uninstallScript(id);
    }

    return this.tunnelRepo.delete(id);
  }

  async installScript(id: number) {
    const tunnel = await this.tunnelRepo
      .createQueryBuilder('tunnel')
      .addSelect('tunnel.password')
      .addSelect('tunnel.privateKey')
      .where('tunnel.id = :id', { id })
      .getOne();

    if (!tunnel)
      throw new HttpException('Tunnel not found', HttpStatus.NOT_FOUND);

    const targetNode = tunnel.nodeId
      ? await this.nodeRepo.findOne({ where: { id: tunnel.nodeId } })
      : await this.nodeRepo.findOne({ where: { isMain: true } });
    const hostSetting = await this.settingRepo.findOne({ where: { key: 'xui_ip' } });

    if (!targetNode && (!hostSetting || !hostSetting.value)) {
      throw new HttpException(
        'В настройках (Settings) не сохранен Host/IP основного сервера (xui_host). Сохраните настройки подключения к 3x-ui заново.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const mainServerIp =
      targetNode?.host || this.getNodeAddress(targetNode) || hostSetting.value;

    this.logger.debug(
      `Начинаем установку редиректа на ${tunnel.ip} -> ${mainServerIp}`,
    );

    const command = `sudo ORIGIN_IP="${mainServerIp}" bash -c "$(curl -sSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/forwarding_install.sh)"`;

    try {
      const output = await this.sshService.executeCommand(
        {
          host: tunnel.ip,
          port: tunnel.sshPort,
          username: tunnel.username,
          password: tunnel.password,
          privateKey: tunnel.privateKey,
        },
        command,
        180000,
      );

      this.logger.debug(`Скрипт выполнен успешно:\n${output}`);

      tunnel.isInstalled = true;
      await this.tunnelRepo.save(tunnel);

      return { success: true, output };
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Ошибка SSH: ${error.message}`);
      throw new HttpException(
        `Ошибка установки: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async uninstallScript(id: number) {
    const tunnel = await this.tunnelRepo
      .createQueryBuilder('tunnel')
      .addSelect('tunnel.password')
      .addSelect('tunnel.privateKey')
      .where('tunnel.id = :id', { id })
      .getOne();

    if (!tunnel) {
      throw new HttpException('Tunnel not found', HttpStatus.NOT_FOUND);
    }

    const command =
      'sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/denpiligrim/3dp-manager/main/forwarding_delete.sh)"';

    try {
      const output = await this.sshService.executeCommand(
        {
          host: tunnel.ip,
          port: tunnel.sshPort,
          username: tunnel.username,
          password: tunnel.password,
          privateKey: tunnel.privateKey,
        },
        command,
        180000,
      );

      tunnel.isInstalled = false;
      await this.tunnelRepo.save(tunnel);
      return { success: true, output };
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Forwarding delete error: ${error.message}`);
      throw new HttpException(
        `Forwarding delete failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getNodeAddress(node?: Node | null) {
    if (!node?.url) return undefined;

    try {
      return new URL(node.url).hostname;
    } catch {
      return node.url;
    }
  }
}
