import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Definitivo depois da primeira publicação na Google Play: confirme antes.
  appId: 'br.com.j2bot.studyroutine',
  appName: 'StudyRoutine',
  webDir: 'dist',
  android: {
    // Origem https://localhost: a mesma que o servidor libera no CORS.
    allowMixedContent: false,
  },
  plugins: {
    // Requisições pelo lado nativo: os metadados do áudio oficial não dependem de CORS no Android.
    CapacitorHttp: { enabled: true },
    LocalNotifications: {
      smallIcon: 'ic_stat_studyroutine',
      iconColor: '#45509C',
    },
  },
};

export default config;
