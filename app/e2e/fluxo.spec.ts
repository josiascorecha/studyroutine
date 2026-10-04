import { expect, test, type Page } from '@playwright/test';

const SEXTA = '2026-10-02';
const DOMINGO = '2026-10-04';

const MARKERS: Record<number, { dur: number; m: number[] }> = {
  40: { dur: 245.616, m: [2.469, 19.105, 27.081, 38.58, 59.875, 81.558, 90.196, 107.897, 127.57, 141.84, 158.444, 173.905, 189.474, 196.911, 209.459, 232.66] },
  41: { dur: 227.64, m: [2.634, 19.0, 35.177, 43.219, 48.117, 62.927, 77.435, 85.907, 100.996, 117.465, 139.633, 149.491, 158.695, 167.077, 174.692, 182.609, 205.599, 212.466] },
};

const ts = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
};

/** WAV de 1 segundo em silêncio, para o tocador ter o que tocar sem acessar a internet. */
function silentWav(): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data.fill(128)]);
}

/** Simula o serviço de metadados e os MP3 oficiais (formato real, conteúdo de teste). */
async function mockOfficial(page: Page) {
  await page.route('https://b.jw-cdn.org/**', (route) => {
    const u = new URL(route.request().url());
    const pub = u.searchParams.get('pub');
    if (pub === 'nwt') {
      const c = Number(u.searchParams.get('track'));
      const r = MARKERS[c];
      if (!r) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        json: {
          files: {
            T: {
              MP3: [
                {
                  title: `Capítulo ${c}`,
                  file: { url: `https://cfp2.jw-cdn.org/a/teste/2/o/nwt_24_Jer_T_${c}.mp3` },
                  duration: r.dur,
                  markers: { markers: r.m.map((t, i) => ({ verseNumber: i + 1, startTime: ts(t) })) },
                },
              ],
            },
          },
        },
      });
    }
    if (pub === 'w' && u.searchParams.get('issue') === '202607') {
      return route.fulfill({
        json: {
          files: {
            T: {
              MP3: [
                { title: 'Ajude outros a conhecer a Jeová (28 de setembro—4 de outubro)', file: { url: 'https://cfp2.jw-cdn.org/a/teste/1/o/w_T_202607_04.mp3' }, duration: 1089, docid: 2026485 },
              ],
            },
          },
        },
      });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://cfp2.jw-cdn.org/**', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }));
}

async function onboard(page: Page, day = SEXTA) {
  await mockOfficial(page);
  await page.goto(`/?hoje=${day}`);
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByText('quinta, 1/10 e terça, 6/10')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Escuro' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dia' })).toBeVisible();
}

async function registerWeek(page: Page) {
  await page.getByRole('button', { name: 'Cadastrar leitura' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Leitura da semana' });
  await sheet.getByLabel('Livro').selectOption('24');
  await sheet.getByLabel('Do capítulo').selectOption('40');
  await sheet.getByLabel('Até o capítulo').selectOption('41');
  await sheet.getByRole('button', { name: 'Lição 2', exact: true }).click();
  await sheet.getByRole('button', { name: 'Lição 5', exact: true }).click();
  await sheet.getByRole('button', { name: /Salvar Jeremias 40–41/ }).click();
  await expect(sheet).toBeHidden();
}

test('configuração inicial, leitura até a reunião, preparo e ministério', async ({ page }) => {
  await onboard(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'escuro');
  await registerWeek(page);

  const leitura = page.getByRole('region', { name: 'Leitura da Bíblia' });
  await expect(leitura.getByText('Jeremias 40:1–7')).toBeVisible();
  await expect(leitura.getByText(/≈ 2 min de áudio · até terça, 6\/10/)).toBeVisible();
  await leitura.getByRole('button', { name: 'Marcar como lida' }).click();
  await expect(leitura.getByText('Feito hoje. Próxima: sábado, 3/10, Jeremias 40:8–14.')).toBeVisible();

  await leitura.getByRole('button', { name: 'Ouvir' }).click();
  const player = page.getByLabel('Reprodutor de áudio');
  await expect(player.getByText('Leitura de hoje · Jeremias 40:1–7')).toBeVisible();
  await player.getByRole('button', { name: 'Fechar o áudio' }).click();

  // Dois dias depois, sem ler no sábado: o app redistribui o restante.
  await page.goto(`/?hoje=${DOMINGO}`);
  await expect(page.getByText('Jeremias 40:8–16')).toBeVisible();
  await expect(page.getByText(/Um dia ficou sem leitura/)).toBeVisible();

  // Preparo de A Sentinela: título vem dos metadados oficiais do áudio.
  const prep = page.getByRole('region', { name: 'Preparo de A Sentinela' });
  await expect(prep.getByText('Ajude outros a conhecer a Jeová')).toBeVisible();
  await prep.getByRole('button', { name: 'Preparar' }).click();
  for (let i = 0; i < 18; i++) await page.getByRole('button', { name: 'Um parágrafo a mais' }).click();
  await page.getByRole('button', { name: 'Parágrafo 3', exact: true }).click();
  await expect(page.getByText('1 de 18')).toBeVisible();
  await page.getByLabel('Favorito 1').selectOption('5');
  await page.getByLabel('Meu comentário, com minhas palavras').first().fill('Ajudar com paciência');
  await page.getByLabel('Meu comentário, com minhas palavras').first().blur();
  await page.getByRole('button', { name: 'Ver cartão da reunião' }).click();
  const card = page.getByRole('dialog', { name: 'Cartão da reunião' });
  await expect(card.getByText('Parágrafo 5')).toBeVisible();
  await expect(card.getByText('Ajudar com paciência')).toBeVisible();
  await card.getByRole('button', { name: 'Fechar' }).click();

  // Leitura da semana: a sexta lida, o sábado ajustado.
  await page.getByRole('button', { name: 'Leitura', exact: true }).click();
  await expect(page.getByText('Ajustado')).toBeVisible();

  // Ministério do publicador: participação e relatório sem horas.
  await page.getByRole('button', { name: 'Ministério', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar saída de hoje' }).click();
  await expect(page.getByText('Sim', { exact: true })).toBeVisible();
  await expect(page.locator('pre.report')).toContainText('Participei no ministério: sim');
  await expect(page.locator('pre.report')).not.toContainText('Horas');

  // Estudo pessoal e família: temas, sugestões (só links do jw.org), adoração em família e links próprios.
  await page.getByRole('button', { name: 'Estudo', exact: true }).click();
  const temas = page.getByRole('group', { name: 'Temas de interesse' });
  await temas.getByRole('button', { name: 'Crianças' }).click();
  const sugestoes = page.getByRole('region', { name: 'Sugestões de estudo' });
  await expect(sugestoes.getByText('Use nosso site para ensinar seus filhos')).toBeVisible();
  await expect(sugestoes.getByText('O que é adoração em família?')).toBeHidden();
  await sugestoes.getByRole('button', { name: 'Já vi' }).first().click();
  await expect(sugestoes.getByText('Visto')).toBeVisible();

  const familia = page.getByRole('region', { name: 'Adoração em família' });
  await familia.getByRole('group', { name: 'Dia da adoração em família' }).getByRole('button', { name: 'Dom' }).click();
  await expect(familia.getByText('Hoje é o dia da adoração em família.')).toBeVisible();
  await familia.getByRole('button', { name: 'Registrar adoração de hoje' }).click();
  await expect(familia.getByText('Feita hoje')).toBeVisible();

  const meus = page.getByRole('region', { name: 'Meus links' });
  await meus.getByLabel('Link do jw.org').fill('https://exemplo.com.br/artigo');
  await meus.getByLabel('Título, com suas palavras').fill('Paciência');
  await meus.getByRole('button', { name: 'Salvar link' }).click();
  await expect(page.getByText(/Use um link do jw.org/)).toBeVisible();
  await meus.getByLabel('Link do jw.org').fill('https://wol.jw.org/pt/wol/d/r5/lp-t/2024247');
  await meus.getByRole('button', { name: 'Salvar link' }).click();
  await expect(meus.getByText('Paciência', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Adoração em família' }).getByText('Registrada hoje.')).toBeVisible();
});

test('sincronização cifrada entre dois aparelhos e exclusão do cofre', async ({ browser }) => {
  const a = await browser.newContext();
  const pa = await a.newPage();
  await onboard(pa);
  await registerWeek(pa);
  await pa.getByRole('region', { name: 'Leitura da Bíblia' }).getByRole('button', { name: 'Marcar como lida' }).click();

  await pa.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await pa.getByRole('button', { name: 'Ativar sincronização' }).click();
  const key = (await pa.locator('.key').textContent())!.trim();
  expect(key).toMatch(/^([A-Z2-9]{4}-){6}[A-Z2-9]{4}$/);
  await pa.getByLabel(/digite os 4 últimos caracteres/).fill(key.slice(-4));
  await pa.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(pa.getByText(/Última sincronização/)).toBeVisible();

  // Aparelho B: pareia na tela de boas-vindas e recebe configurações e leitura.
  const b = await browser.newContext();
  const pb = await b.newPage();
  await mockOfficial(pb);
  await pb.goto(`/?hoje=${SEXTA}`);
  await pb.getByRole('button', { name: 'Já uso o StudyRoutine em outro aparelho' }).click();
  await pb.getByLabel('Chave de recuperação').fill(key.toLowerCase());
  await pb.getByRole('button', { name: 'Parear este aparelho' }).click();
  await expect(pb.getByRole('heading', { name: 'Seu dia' })).toBeVisible();
  await expect(pb.locator('html')).toHaveAttribute('data-theme', 'escuro');
  await expect(pb.getByText(/Feito hoje\. Próxima: sábado/)).toBeVisible();

  // B marca o texto diário; A recebe.
  await pb.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Marcar como lido' }).click();
  await pb.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await pb.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(pb.getByText(/Última sincronização/)).toBeVisible();
  await pa.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(pa.getByText(/Última sincronização/)).toBeVisible();
  await pa.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(pa.getByRole('region', { name: 'Texto diário' }).getByText('Feito')).toBeVisible();

  // Página pública de exclusão (exigência da Google Play).
  const c = await browser.newContext();
  const pc = await c.newPage();
  await pc.goto('/excluir-dados');
  await pc.getByLabel('Chave de recuperação').fill(key);
  await pc.getByRole('button', { name: 'Apagar do servidor' }).click();
  await expect(pc.getByText(/O cofre e tudo o que havia nele foram apagados/)).toBeVisible();

  await pa.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await pa.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(pa.getByText(/O servidor não reconheceu esta chave/)).toBeVisible();

  await pc.goto('/privacidade');
  await expect(pc.getByRole('heading', { name: 'Política de privacidade' })).toBeVisible();
  await a.close();
  await b.close();
  await c.close();
});
