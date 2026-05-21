import { type ChangeEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import api from '../api';
import { Logger } from '../utils/logger';

export default function SettingsPage() {
  const [adminProfile, setAdminProfile] = useState({
    login: '',
    password: '',
  });
  const [message, setMessage] = useState({
    open: false,
    type: 'success' as 'success' | 'error',
    text: '',
  });

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get<Record<string, string>>('/settings');
      if (data.admin_login) {
        setAdminProfile((prev) => ({ ...prev, login: data.admin_login }));
      }
    } catch (error) {
      Logger.error('Failed to load profile settings', 'Settings', error);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleChange =
    (field: 'login' | 'password') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setAdminProfile((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSave = async () => {
    if (!adminProfile.login.trim()) {
      setMessage({ open: true, type: 'error', text: 'Login is required' });
      return;
    }

    try {
      await api.post('/auth/update-profile', adminProfile);
      setAdminProfile((prev) => ({ ...prev, password: '' }));
      setMessage({ open: true, type: 'success', text: 'Profile updated' });
    } catch (error) {
      Logger.error('Update profile error', 'Settings', error);
      setMessage({ open: true, type: 'error', text: 'Failed to update profile' });
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Настройки
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 680 }}>
        <Typography variant="h6">Профиль панели 3dp-manager</Typography>
        <Divider sx={{ my: 2 }} />
        <Stack spacing={2}>
          <TextField
            label="Логин"
            value={adminProfile.login}
            onChange={handleChange('login')}
            fullWidth
          />
          <TextField
            label="Новый пароль"
            type="password"
            value={adminProfile.password}
            onChange={handleChange('password')}
            helperText="Оставьте пустым, если не хотите менять пароль"
            fullWidth
          />
          <Box>
            <Button variant="contained" onClick={handleSave}>
              Сохранить
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Snackbar
        open={message.open}
        autoHideDuration={5000}
        onClose={() => setMessage({ ...message, open: false })}
      >
        <Alert severity={message.type}>{message.text}</Alert>
      </Snackbar>
    </Box>
  );
}
