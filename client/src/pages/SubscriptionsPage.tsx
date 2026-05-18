import { useEffect, useState, useCallback } from 'react';
import {
  Box, Button, Typography, Paper, Table, TableBody, TableCell,
  TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, TextField, DialogActions, FormControl, Select,
  InputAdornment, InputLabel, MenuItem, Snackbar, Alert,
  useTheme,
  useMediaQuery,
  Menu,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Stack,
  Chip,
  Divider,
  Tooltip
} from '@mui/material';
import { Delete, Add, Link as LinkIcon, OpenInNew, ContentCopy, Dns, Router, Edit, MoreVert, Remove, Refresh, PauseCircleFilled, PlayCircleFilled } from '@mui/icons-material';
import api from '../api';
import { copyToClipboard } from '../utils/copyToClipboard';
import { Logger } from '../utils/logger';
import type { NodeRecord } from '../types/node';

interface Subscription {
  id: string;
  name: string;
  uuid: string;
  inbounds: unknown[];
  inboundsConfig?: InboundConfigUI[];
  isAutoRotationEnabled?: boolean;
  nodeId?: string;
  relayServerId?: number;
}

interface Tunnel {
  id: number;
  name: string;
  ip: string;
  domain: string;
  isInstalled: boolean;
  nodeId?: string;
}

interface InboundConfigUI {
  id: string;
  type: string;
  port: string;
  sni: string;
  link?: string;
  nodeId?: string;
  relayServerId?: string;
}

interface Domain { id: number; name: string; }

const CONNECTION_OPTIONS = [
  'vless-tcp-reality',
  'vless-xhttp-reality',
  'vless-grpc-reality',
  'vless-ws',
  'hysteria2-udp',
  'vmess-tcp',
  'shadowsocks-tcp',
  'trojan-tcp-reality',
  'custom',
];

const patchLink = function (link: string, newHost: string): string {
  if (link.startsWith('vmess://')) {
    try {
      const base64Part = link.substring(8);
      const jsonStr = Buffer.from(base64Part, 'base64').toString('utf-8');
      const config = JSON.parse(jsonStr);
      config.add = newHost;
      const newJsonStr = JSON.stringify(config);
      const newBase64 = Buffer.from(newJsonStr).toString('base64');
      return `vmess://${newBase64}`;
    } catch {
      return link;
    }
  } else if (link.startsWith('vless://') || link.startsWith('trojan://')) {
    return link.replace(/@.*?:/, `@${newHost}:`);
  } else if (link.startsWith('ss://')) {
    if (link.includes('@')) {
      return link.replace(/@.*?:/, `@${newHost}:`);
    }
    return link;
  }
  return link;
};

const generateId = () => Math.random().toString(36).substring(7);

const getSubscriptionUrl = (uuid: string, tunnelId: string | number) => {
  // Используем относительный путь - Nginx проксирует /bus/ на бэкенд
  const tunnelPart = tunnelId !== 'main' ? `/${tunnelId}` : '';
  const path = `/bus/${uuid}${tunnelPart}`;
  // Для копирования нужен полный URL с origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return path;
};

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | number>('main');
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeSub, setActiveSub] = useState<Subscription | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [rotationSettings, setRotationSettings] = useState({
    rotation_interval: '30',
    rotation_status: 'active',
    last_rotation_timestamp: '',
  });
  const [rotationLoading, setRotationLoading] = useState(false);
  const openActionMenu = Boolean(menuAnchorEl);

  // Состояния модального окна конструктора
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inbounds, setInbounds] = useState<InboundConfigUI[]>([]);
  const [portErrors, setPortErrors] = useState<Record<string, string>>({});

  // Состояния ссылок
  const [linksOpen, setLinksOpen] = useState(false);
  const [currentLinks, setCurrentLinks] = useState<string[]>([]);

  // Snackbar state for notifications
  const [snackbar, setSnackbar] = useState({ open: false, type: 'success' as 'success' | 'error', message: '' });

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false, title: '', onConfirm: () => {},
    confirmText: 'Удалить', confirmColor: 'error' as 'error' | 'primary'
  });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const loadSubs = useCallback(async () => {
    try {
      Logger.debug('Loading subscriptions...', 'Subs');
      const { data } = await api.get('/subscriptions');
      setSubs(data);
      Logger.debug(`Loaded ${data.length} subscriptions`, 'Subs');

      const tunnelsRes = await api.get('/tunnels');
      setTunnels(tunnelsRes.data.filter((el: Tunnel) => el.isInstalled));
      Logger.debug(`Loaded ${tunnelsRes.data.filter((el: Tunnel) => el.isInstalled).length} active tunnels`, 'Subs');

      const nodesRes = await api.get<NodeRecord[]>('/nodes');
      setNodes(nodesRes.data);
      Logger.debug(`Loaded ${nodesRes.data.length} nodes`, 'Subs');

      const allDomains = await api.get('/domains/all');
      setDomains(allDomains.data);
      Logger.debug(`Loaded ${allDomains.data.length} domains`, 'Subs');

      const settingsRes = await api.get('/settings');
      setRotationSettings((prev) => ({ ...prev, ...settingsRes.data }));
    } catch (error) {
      Logger.error('Failed to load', 'Subs', error);
      throw error;
    }
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);

  const handleActionMenuClick = (event: React.MouseEvent<HTMLButtonElement>, sub: Subscription) => {
    setMenuAnchorEl(event.currentTarget);
    setActiveSub(sub);
  };

  const handleActionMenuClose = () => {
    setMenuAnchorEl(null);
    setActiveSub(null);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setInbounds([
      { id: generateId(), type: 'hysteria2-udp', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-xhttp-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-grpc-reality', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vless-ws', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'vmess-tcp', port: 'random', sni: 'random', link: '' },
      { id: generateId(), type: 'shadowsocks-tcp', port: 'random', sni: 'random', link: '' },
    ]);
    setPortErrors({});
    setOpen(true);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setEditingId(sub.id);
    setName(sub.name);

    if (sub.inboundsConfig && sub.inboundsConfig.length > 0) {
      setInbounds(sub.inboundsConfig.map(i => ({
        id: generateId(),
        type: i.type || 'vless-tcp-reality',
        port: i.port ? i.port.toString() : 'random',
        sni: i.sni || 'random',
        link: i.link || '',
        nodeId: i.nodeId || '',
        relayServerId: i.relayServerId ? i.relayServerId.toString() : ''
      })));
    } else {
      setInbounds([{ id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' }]);
    }

    setPortErrors({});
    setOpen(true);
  };

  const handleInboundChange = (id: string, field: keyof InboundConfigUI, value: string) => {
    setInbounds(prev => prev.map(inb => {
      if (inb.id !== id) return inb;
      const next = { ...inb, [field]: value };
      if (field === 'nodeId') {
        next.relayServerId = '';
      }
      if (field === 'type' && value === 'custom') {
        next.nodeId = '';
        next.relayServerId = '';
      }
      return next;
    }));
    if (field === 'port' || (field === 'type' && value === 'custom')) {
      setPortErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const addInbound = () => {
    if (inbounds.length < 20) {
      setInbounds([...inbounds, { id: generateId(), type: 'vless-tcp-reality', port: 'random', sni: 'random', link: '' }]);
    }
  };

  const removeInbound = (id?: string) => {
    if (id) {
      if (inbounds.length > 1) {
        setInbounds(inbounds.filter(inb => inb.id !== id));
        setPortErrors(prev => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
      }
    } else {
      setInbounds([
        {
          id: crypto.randomUUID(),
          type: 'vless-tcp-reality',
          port: 'random',
          sni: 'random',
          link: ''
        }
      ]);
      setPortErrors({});
    }
  };

  const handleSave = async () => {
    if (Object.keys(portErrors).length > 0) {
      setSnackbar({ open: true, type: 'error', message: 'Пожалуйста, исправьте ошибки с портами' });
      return;
    }
    if (!name.trim()) {
      setSnackbar({ open: true, type: 'error', message: 'Введите имя подписки' });
      return;
    }

    const payload = {
      name,
      inboundsConfig: inbounds.map(i => {
        if (i.type === 'custom') {
          return {
            type: i.type,
            link: i.link,
          };
        }
        return {
          type: i.type,
          port: i.port === 'random' ? 'random' : parseInt(i.port),
          sni: i.sni,
          nodeId: i.nodeId || undefined,
          relayServerId: i.relayServerId ? parseInt(i.relayServerId, 10) : undefined
        };
      })
    };

    try {
      Logger.debug(`${editingId ? 'Updating' : 'Creating'} subscription`, 'Subs', payload);
      if (editingId) {
        await api.put(`/subscriptions/${editingId}`, payload);
        Logger.debug(`Updated subscription ${editingId}`, 'Subs');
      } else {
        await api.post('/subscriptions', payload);
        Logger.debug('Created subscription', 'Subs');
      }
      setOpen(false);
      loadSubs();
      setSnackbar({ open: true, type: 'success', message: editingId ? 'Подписка обновлена' : 'Подписка создана' });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Произошла ошибка при сохранении';
      Logger.error(`Save error: ${message}`, 'Subs');
      setSnackbar({ open: true, type: 'error', message });
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: 'Удалить подписку и все соединения?',
      confirmText: 'Удалить',
      confirmColor: 'error',
      onConfirm: async () => {
        Logger.debug(`Deleting subscription: ${id}`, 'Subs');
        await api.delete(`/subscriptions/${id}`);
        Logger.debug(`Deleted subscription ${id}`, 'Subs');
        loadSubs();
        setSnackbar({ open: true, type: 'success', message: 'Подписка удалена' });
      }
    });
  };

  const handleToggleAutoRotation = async (subscriptionId: string, enabled: boolean) => {
    try {
      await api.put('/subscriptions/bulk-auto-rotation', {
        subscriptionIds: [subscriptionId],
        enabled
      });
      setSubs(prev => prev.map(s =>
        s.id === subscriptionId ? { ...s, isAutoRotationEnabled: enabled } : s
      ));
      setSnackbar({
        open: true,
        type: 'success',
        message: enabled ? 'Авторотация включена' : 'Авторотация выключена'
      });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Ошибка обновления';
      Logger.error(`Toggle auto-rotation error: ${message}`, 'Subs');
      setSnackbar({ open: true, type: 'error', message });
      loadSubs();
    }
  };

  const handleManualRotate = async (sub: Subscription) => {
    setConfirmDialog({
      open: true,
      title: `Обновить подписку "${sub.name}" сейчас?`,
      confirmText: 'Обновить',
      confirmColor: 'primary',
      onConfirm: async () => {
        try {
          Logger.debug(`Starting manual rotation for subscription: ${sub.id}`, 'Subs');
          const res = await api.post(`/rotation/rotate-one/${sub.id}`);
          Logger.debug('Manual rotation completed', 'Subs');
          setSnackbar({ open: true, type: 'success', message: res.data.message || 'Ротация выполнена' });
          loadSubs();
        } catch (error: unknown) {
          const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Ошибка ротации';
          Logger.error(`Manual rotation error: ${message}`, 'Subs');
          setSnackbar({ open: true, type: 'error', message });
        }
      }
    });
  };

  const saveRotationSettings = async (nextSettings = rotationSettings) => {
    await api.post('/settings', nextSettings);
    setRotationSettings(nextSettings);
  };

  const toggleRotationService = async () => {
    const nextStatus = rotationSettings.rotation_status === 'stopped' ? 'active' : 'stopped';
    const nextSettings = { ...rotationSettings, rotation_status: nextStatus };
    try {
      await saveRotationSettings(nextSettings);
      setSnackbar({
        open: true,
        type: 'success',
        message: nextStatus === 'active' ? 'Ротация включена' : 'Ротация остановлена'
      });
    } catch (error) {
      Logger.error('Rotation status update error', 'Subs', error);
      setSnackbar({ open: true, type: 'error', message: 'Не удалось изменить статус ротации' });
    }
  };

  const saveRotationInterval = async () => {
    const interval = parseInt(rotationSettings.rotation_interval, 10);
    if (Number.isNaN(interval) || interval < 10) {
      setSnackbar({ open: true, type: 'error', message: 'Минимальный интервал ротации — 10 минут' });
      return;
    }

    try {
      await saveRotationSettings(rotationSettings);
      setSnackbar({ open: true, type: 'success', message: 'Интервал ротации сохранён' });
    } catch (error) {
      Logger.error('Rotation interval update error', 'Subs', error);
      setSnackbar({ open: true, type: 'error', message: 'Не удалось сохранить интервал' });
    }
  };

  const rotateAllNow = async () => {
    setConfirmDialog({
      open: true,
      title: 'Сгенерировать инбаунды сейчас для всех активных подписок?',
      confirmText: 'Сгенерировать',
      confirmColor: 'primary',
      onConfirm: async () => {
        try {
          setRotationLoading(true);
          const { data } = await api.post('/rotation/rotate-all');
          setSnackbar({
            open: true,
            type: data?.success ? 'success' : 'error',
            message: data?.message || 'Ротация завершена'
          });
          loadSubs();
        } catch (error: unknown) {
          const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Ошибка ротации';
          setSnackbar({ open: true, type: 'error', message });
        } finally {
          setRotationLoading(false);
        }
      }
    });
  };

  const formatRotationDate = (value: string) => {
    if (!value) return 'Нет данных';
    return new Date(Number(value)).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getNextRotationDate = () => {
    if (rotationSettings.rotation_status === 'stopped') return 'Пауза';
    if (!rotationSettings.last_rotation_timestamp) return 'Ожидание';

    const interval = parseInt(rotationSettings.rotation_interval, 10) || 30;
    const next = new Date(Number(rotationSettings.last_rotation_timestamp) + interval * 60000);
    return next.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const showLinks = (sub: Subscription) => {
    let links: string[] = [];
    if (selectedServer === 'main') {
      links = sub.inbounds?.map(i => (i as { link?: string }).link).filter(Boolean) || [];
    } else {
      const tunnelIndex = +selectedServer - 1;
      const host = tunnels[tunnelIndex]?.domain?.length > 0 ? tunnels[tunnelIndex].domain : tunnels[tunnelIndex].ip;
      links = sub.inbounds?.map(i => patchLink((i as { link?: string }).link || '', host)).filter(Boolean) || [];
    }
    if (links.length === 0) {
      setCurrentLinks(['Нет активных ссылок (ждите ротации)']);
    } else {
      setCurrentLinks(links);
    }
    setLinksOpen(true);
  };

  const handleCopyLink = async (uuid: string, tunnelId: string | number) => {
    await copyToClipboard(getSubscriptionUrl(uuid, tunnelId));
    setSnackbar({ open: true, type: 'success', message: 'Ссылка на подписку скопирована' });
  };

  const getDefaultNodeId = () => nodes.find((node) => node.isMain)?.id || '';

  const getRelayOptions = (inboundNodeId?: string) => {
    const effectiveNodeId = inboundNodeId || getDefaultNodeId();
    return tunnels.filter((tunnel) => tunnel.nodeId === effectiveNodeId);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant={isMobile ? 'h5' : 'h4'}>Подписки</Typography>
        {tunnels.length > 0 && (
          <FormControl variant='standard' size="small" sx={{ minWidth: 220, justifyContent: 'center' }}>
            <Select
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
              startAdornment={
                <InputAdornment position="start">
                  {selectedServer === 'main' ? <Dns fontSize="small" /> : <Router fontSize="small" />}
                </InputAdornment>
              }
            >
              <MenuItem value="main">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Основной сервер</Typography>
              </MenuItem>
              {tunnels.map((t) => (
                <MenuItem key={t.id} value={t.id.toString()}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Box>
          <Button variant="contained" startIcon={<Add />} onClick={handleOpenCreate}>Создать</Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Статус ротации</Typography>
            <Chip
              icon={rotationSettings.rotation_status === 'stopped' ? <PauseCircleFilled /> : <PlayCircleFilled />}
              label={rotationSettings.rotation_status === 'stopped' ? 'Остановлена' : 'Активна'}
              color={rotationSettings.rotation_status === 'stopped' ? 'warning' : 'success'}
              size="small"
              variant="outlined"
              sx={{ mt: 1 }}
            />
          </Box>
          <Box>
          <Tooltip title={rotationSettings.rotation_status === 'stopped' ? "Возобновить ротацию" : "Поставить на паузу"}>
            <IconButton
              onClick={toggleRotationService}
              size="small"
            >
              {rotationSettings.rotation_status === 'stopped' ? <PlayCircleFilled fontSize="large" /> : <PauseCircleFilled fontSize="large" />}
            </IconButton>
          </Tooltip>
          </Box>
          <Divider flexItem orientation={isMobile ? 'horizontal' : 'vertical'} />
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Последняя генерация</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{formatRotationDate(rotationSettings.last_rotation_timestamp)}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Следующая генерация</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{getNextRotationDate()}</Typography>
          </Box>
          <TextField
            label="Интервал, мин"
            type="number"
            size="small"
            value={rotationSettings.rotation_interval}
            onChange={(e) => setRotationSettings((prev) => ({ ...prev, rotation_interval: e.target.value }))}
            sx={{ width: { xs: '100%', md: 150 } }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={saveRotationInterval}>Сохранить интервал</Button>
            <Button variant="contained" loading={rotationLoading} onClick={rotateAllNow}>
              Обновить все
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Имя</TableCell>
              <TableCell>UUID</TableCell>
              <TableCell>Инбаунды</TableCell>
              <TableCell>Авторотация</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subs.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell sx={{ fontWeight: 700 }}>{sub.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{sub.uuid}</TableCell>
                <TableCell>{sub.inbounds?.length || 0}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={sub.isAutoRotationEnabled ?? true}
                    onChange={(e) => handleToggleAutoRotation(sub.id, e.target.checked)}
                    color="primary"
                  />
                </TableCell>
                <TableCell align="right">
                  {!isMobile && (
                    <>
                      <IconButton
                        color="primary"
                        onClick={() => handleCopyLink(sub.uuid, selectedServer)}
                        title="Копировать ссылку"
                      >
                        <ContentCopy />
                      </IconButton>
                      <IconButton
                        color="primary"
                        onClick={() => window.open(getSubscriptionUrl(sub.uuid, selectedServer), '_blank')}
                        title="Открыть подписку"
                      >
                        <OpenInNew />
                      </IconButton>
                    </>
                  )}

                  {/* Кнопка "Три точки" для вызова меню действий */}
                  <IconButton onClick={(e) => handleActionMenuClick(e, sub)}>
                    <MoreVert />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {subs.length === 0 && <Typography sx={{ p: 2 }} color='textSecondary' textAlign='center'>Нет подписок</Typography>}
      </Paper>

      <Menu
        anchorEl={menuAnchorEl}
        open={openActionMenu}
        onClose={handleActionMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {isMobile && activeSub && (
          <MenuItem onClick={() => handleCopyLink(activeSub.uuid, selectedServer)}>
            <ListItemIcon><ContentCopy fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Копировать ссылку</ListItemText>
          </MenuItem>
        )}
        {isMobile && activeSub && (
          <MenuItem onClick={() => window.open(getSubscriptionUrl(activeSub.uuid, selectedServer), '_blank')}>
            <ListItemIcon><OpenInNew fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Открыть подписку</ListItemText>
          </MenuItem>
        )}

        {activeSub && (
          <MenuItem onClick={() => showLinks(activeSub)}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Показать конфиги</ListItemText>
          </MenuItem>
        )}
        {activeSub && (
          <MenuItem onClick={() => handleManualRotate(activeSub)}>
            <ListItemIcon><Refresh fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Обновить сейчас</ListItemText>
          </MenuItem>
        )}
        {activeSub && (
          <MenuItem onClick={() => handleOpenEdit(activeSub)}>
            <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
            <ListItemText>Редактировать</ListItemText>
          </MenuItem>
        )}
        {activeSub && (
          <MenuItem onClick={() => handleDelete(activeSub.id)}>
            <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>Удалить</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Модальное окно создания / редактирования */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth disableRestoreFocus>
        <DialogTitle variant='h5'>{editingId ? 'Редактировать подписку' : 'Новая подписка'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus margin="dense" label="Имя подписки" fullWidth
            value={name} onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="h6" sx={{ mb: 2 }}>
            Инбаунды ({inbounds.length}/20)
          </Typography>

          {inbounds.map((inb, index) => (
            <Box key={inb.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2, p: 2 }}>
              <Typography sx={{ mt: 1, minWidth: 30, fontWeight: 'bold' }}>#{index + 1}</Typography>

              <FormControl size="small" sx={{ minWidth: 185 }}>
                <InputLabel>Тип</InputLabel>
                <Select
                  value={inb.type}
                  label="Тип"
                  sx={{ minWidth: '185px' }}
                  onChange={(e) => handleInboundChange(inb.id, 'type', e.target.value)}
                >
                  {CONNECTION_OPTIONS.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                </Select>
              </FormControl>

              {inb.type === 'custom' ? (
                // Поле для кастомной ссылки
                <FormControl size="small" sx={{ flexGrow: 1 }}>
                  <TextField
                    size="small"
                    label="Ссылка на подключение"
                    placeholder="vless://..."
                    value={inb.link || ''}
                    onChange={(e) => handleInboundChange(inb.id, 'link', e.target.value)}
                    fullWidth
                  />
                </FormControl>
              ) : (
                <>
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel>Нода</InputLabel>
                    <Select
                      value={inb.nodeId || ''}
                      label="Нода"
                      onChange={(e) => handleInboundChange(inb.id, 'nodeId', e.target.value)}
                    >
                      <MenuItem value="">Основная нода</MenuItem>
                      {nodes.map((node) => (
                        <MenuItem key={node.id} value={node.id}>
                          {node.name}{node.isMain ? ' (основная)' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel>Relay</InputLabel>
                    <Select
                      value={inb.relayServerId || ''}
                      label="Relay"
                      onChange={(e) => handleInboundChange(inb.id, 'relayServerId', e.target.value)}
                    >
                      <MenuItem value="">Без relay</MenuItem>
                      {getRelayOptions(inb.nodeId).map((tunnel) => (
                        <MenuItem key={tunnel.id} value={tunnel.id.toString()}>
                          {tunnel.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <TextField
                      size="small"
                      label="Порт"
                      placeholder="random или порт"
                      value={inb.port}
                      onChange={(e) => handleInboundChange(inb.id, 'port', e.target.value)}
                      error={!!portErrors[inb.id]}
                      helperText={portErrors[inb.id] || ""}
                      sx={{ width: 140 }}
                    />
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>SNI</InputLabel>
                    <Select
                      value={inb.sni}
                      label="SNI"
                      onChange={(e) => handleInboundChange(inb.id, 'sni', e.target.value)}
                    >
                      <MenuItem value="random">random</MenuItem>
                      {domains.map(opt => <MenuItem key={opt.id} value={opt.name}>{opt.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </>
              )}

              <IconButton
                color="primary"
                onClick={() => removeInbound(inb.id)}
                disabled={inbounds.length <= 1}
                sx={{ mt: 0.5 }}
              >
                <Delete />
              </IconButton>
            </Box>
          ))}

          <Button
            variant="outlined"
            size='small'
            startIcon={<Add />}
            onClick={addInbound}
            disabled={inbounds.length >= 20}
          >
            Добавить инбаунд
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<Remove />}
            sx={{ ml: 0.5 }}
            onClick={() => removeInbound()}
          >
            Удалить все
          </Button>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleSave} variant="contained" color="primary">Сохранить</Button>
        </DialogActions>
      </Dialog>

      {/* Модальное окно ссылок */}
      <Dialog open={linksOpen} onClose={() => setLinksOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Активные ссылки</DialogTitle>
        <DialogContent>
          <TextField
            multiline fullWidth rows={10}
            value={currentLinks.join('\n\n')}
            slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => copyToClipboard(currentLinks.join('\n'))}>Копировать все</Button>
          <Button onClick={() => setLinksOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}>
        <DialogTitle>Подтверждение</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.title}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>Отмена</Button>
          <Button
            onClick={() => {
              confirmDialog.onConfirm();
              setConfirmDialog({ ...confirmDialog, open: false });
            }}
            variant="contained"
            color={confirmDialog.confirmColor}
          >
            {confirmDialog.confirmText}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.type}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
