import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppSettings } from '../app/model';
import { isNative } from '../app/platform';
import { ALL_REMINDER_IDS, reminderPlan, type PlannedReminder } from './plan';

/**
 * Lembretes locais, agendados no próprio aparelho (sem servidor e sem push). Repetem toda semana
 * (ou todo dia); o Android entrega no horário aproximado, sem alarme exato.
 */

/** Dia da semana no formato do Capacitor: 1 = domingo … 7 = sábado. */
function capWeekday(jsDay: number): number {
  return (((jsDay % 7) + 7) % 7) + 1;
}

/**
 * Reagenda tudo a partir dos ajustes. `ask`: pode mostrar o pedido de permissão (só quando a
 * pessoa mexe nos lembretes; na abertura do app, apenas confere).
 */
export async function scheduleReminders(s: AppSettings, ask = true): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!isNative()) return 'unsupported';
  await LocalNotifications.cancel({ notifications: ALL_REMINDER_IDS.map((id) => ({ id })) });
  const plan = reminderPlan(s);
  if (!plan.length) return 'ok';
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted' && ask) perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  await LocalNotifications.schedule({
    notifications: plan.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      extra: { tab: p.tab, meeting: p.meeting },
      schedule: {
        on: p.weekday === undefined ? { hour: p.hour, minute: p.minute } : { weekday: capWeekday(p.weekday), hour: p.hour, minute: p.minute },
        allowWhileIdle: true,
      },
    })),
  });
  return 'ok';
}

/** Toque na notificação: abre a aba certa. */
export function onReminderTap(go: (tab: PlannedReminder['tab'], meeting?: 'meio' | 'fim') => void): () => void {
  if (!isNative()) return () => {};
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const extra = (a.notification.extra ?? {}) as { tab?: PlannedReminder['tab']; meeting?: 'meio' | 'fim' };
    if (extra.tab) go(extra.tab, extra.meeting);
  });
  return () => void h.then((x) => x.remove());
}
