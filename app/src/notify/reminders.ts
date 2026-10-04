import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppSettings } from '../app/model';
import { isNative } from '../app/platform';

/**
 * Lembretes locais, agendados no próprio aparelho (sem servidor e sem push).
 * Os textos são genéricos: o conteúdo do dia é aberto nas fontes oficiais.
 */
const IDS = { dailyText: 101, reading: 102, midweek: 103, weekend: 104 };

function hm(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

/** Dia da semana no formato do Capacitor: 1 = domingo … 7 = sábado. */
function capWeekday(jsDay: number): number {
  return (((jsDay % 7) + 7) % 7) + 1;
}

export async function scheduleReminders(s: AppSettings): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!isNative()) return 'unsupported';
  await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
  if (!s.reminders) return 'ok';
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  const evening = { hour: 19, minute: 0 };
  await LocalNotifications.schedule({
    notifications: [
      { id: IDS.dailyText, title: 'Texto diário', body: 'Hora do texto de hoje.', schedule: { on: hm(s.dtTime), allowWhileIdle: true } },
      { id: IDS.reading, title: 'Leitura da Bíblia', body: 'Sua porção de hoje está pronta.', schedule: { on: hm(s.readTime), allowWhileIdle: true } },
      {
        id: IDS.midweek,
        title: 'Reunião amanhã',
        body: 'Que tal revisar a preparação da reunião de meio de semana?',
        schedule: { on: { weekday: capWeekday(s.midDay - 1), ...evening }, allowWhileIdle: true },
      },
      {
        id: IDS.weekend,
        title: 'Reunião amanhã',
        body: 'Seus parágrafos favoritos de A Sentinela estão no app.',
        schedule: { on: { weekday: capWeekday(s.wkDay - 1), ...evening }, allowWhileIdle: true },
      },
    ],
  });
  return 'ok';
}
