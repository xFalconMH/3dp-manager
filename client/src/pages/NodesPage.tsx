import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  CheckCircle,
  Delete,
  Edit,
  Refresh,
  Star,
  StarBorder,
  Sync,
} from '@mui/icons-material';
import { nodesApi } from '../features/nodes/api';
import type { NodeAuthType, NodePayload, NodeRecord } from '../types/node';

const emptyForm: NodePayload = {
  name: '',
  url: '',
  authType: 'password',
  login: '',
  password: '',
  token: '',
  isMain: false,
};

export default function NodesPage() {
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NodeRecord | null>(null);
  const [form, setForm] = useState<NodePayload>(emptyForm);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [message, setMessage] = useState({
    open: false,
    type: 'success' as 'success' | 'error',
    text: '',
  });

  const mainNode = useMemo(() => nodes.find((node) => node.isMain), [nodes]);

  const loadNodes = useCallback(async () => {
    setNodes(await nodesApi.list());
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (node: NodeRecord) => {
    setEditing(node);
    setForm({
      name: node.name,
      url: node.url || '',
      authType: node.authType,
      login: node.login || '',
      password: '',
      token: '',
      isMain: node.isMain,
      version: node.version || '',
    });
    setOpen(true);
  };

  const updateField = <K extends keyof NodePayload>(key: K, value: NodePayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveNode = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setMessage({ open: true, type: 'error', text: 'Укажите название и URL ноды' });
      return;
    }

    const payload: NodePayload = {
      ...form,
      url: form.url.replace(/\/+$/, ''),
      login: form.authType === 'password' ? form.login : undefined,
      password: form.authType === 'password' && form.password ? form.password : undefined,
      token: form.authType === 'token' && form.token ? form.token : undefined,
    };

    if (editing) {
      await nodesApi.update(editing.id, payload);
    } else {
      await nodesApi.create(payload);
    }

    setOpen(false);
    setMessage({
      open: true,
      type: 'success',
      text: editing ? 'Нода обновлена' : 'Нода добавлена',
    });
    loadNodes();
  };

  const checkFormConnection = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setMessage({ open: true, type: 'error', text: 'Укажите название и URL ноды' });
      return;
    }

    const result = await nodesApi.checkPayload({
      ...form,
      url: form.url.replace(/\/+$/, ''),
      login: form.authType === 'password' ? form.login : undefined,
      password: form.authType === 'password' ? form.password : undefined,
      token: form.authType === 'token' ? form.token : undefined,
    });

    setMessage({
      open: true,
      type: result.success ? 'success' : 'error',
      text: result.success ? 'Подключение успешно' : 'Не удалось подключиться',
    });
  };

  const checkNode = async (node: NodeRecord) => {
    setCheckingId(node.id);
    try {
      const result = await nodesApi.check(node.id);
      setMessage({
        open: true,
        type: result.success ? 'success' : 'error',
        text: result.success ? 'Подключение успешно' : 'Не удалось подключиться',
      });
      loadNodes();
    } finally {
      setCheckingId(null);
    }
  };

  const syncNodes = async () => {
    const result = await nodesApi.syncFromMain();
    setMessage({
      open: true,
      type: 'success',
      text: `Синхронизировано нод: ${result.count}`,
    });
    loadNodes();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography variant="h4">Ноды</Typography>
        </Box>
        <Box>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<Sync />} variant="outlined" onClick={syncNodes}>
              Синхронизировать
            </Button>
            <Button startIcon={<Add />} variant="contained" onClick={openCreate}>
              Добавить
            </Button>
          </Stack>
        </Box>
      </Box>

      <Paper sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>URL панели</TableCell>
              <TableCell>Авторизация</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nodes.map((node) => (
              <TableRow key={node.id}>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton size="small" onClick={() => nodesApi.setMain(node.id).then(loadNodes)} title={node.isMain ? '' : 'Сделать основной'}>
                      {node.isMain ? <Star color="warning" /> : <StarBorder />}
                    </IconButton>
                    <Typography fontWeight={700}>{node.name}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  {node.url}
                </TableCell>
                <TableCell>{node.authType}</TableCell>
                <TableCell>
                  {node.isMain && <Chip icon={<CheckCircle />} label="Основная" color="success" size="small" />}
                </TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => openEdit(node)}>
                    <Edit />
                  </IconButton>
                  <IconButton color="error" onClick={() => nodesApi.remove(node.id).then(loadNodes)}>
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {nodes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                  Ноды не добавлены
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Редактировать ноду' : 'Новая нода'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Название" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
            <TextField
              label="URL панели 3x-ui"
              helperText="Например: https://85.198.84.27:35366/2vIsDA5HanQ3R7JyIH"
              value={form.url}
              onChange={(e) => updateField('url', e.target.value)}
            />
            <FormControl fullWidth>
              <InputLabel>Тип авторизации</InputLabel>
              <Select
                value={form.authType}
                label="Тип авторизации"
                onChange={(e) => updateField('authType', e.target.value as NodeAuthType)}
              >
                <MenuItem value="password">Логин и пароль</MenuItem>
                <MenuItem value="token">Токен</MenuItem>
              </Select>
            </FormControl>
            {form.authType === 'password' ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Логин" fullWidth value={form.login || ''} onChange={(e) => updateField('login', e.target.value)} />
                <TextField
                  label={editing ? 'Новый пароль' : 'Пароль'}
                  type="password"
                  fullWidth
                  value={form.password || ''}
                  onChange={(e) => updateField('password', e.target.value)}
                />
              </Stack>
            ) : (
              <TextField
                label={editing ? 'Новый токен' : 'Токен'}
                type="password"
                value={form.token || ''}
                onChange={(e) => updateField('token', e.target.value)}
              />
            )}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch checked={!!form.isMain} onChange={(e) => updateField('isMain', e.target.checked)} />
              <Typography>Сделать основной нодой</Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={checkFormConnection}>Проверить подключение</Button>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveNode}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={message.open} autoHideDuration={5000} onClose={() => setMessage({ ...message, open: false })}>
        <Alert severity={message.type}>{message.text}</Alert>
      </Snackbar>
    </Box>
  );
}
