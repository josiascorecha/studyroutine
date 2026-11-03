import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const ES_PDF = 'https://cfp2.jw-cdn.org/a/teste/1/o/es26_T.pdf';

async function mockOfficial(page: Page, opts: { workbook?: boolean; esCors?: boolean } = {}) {
  await page.route('https://b.jw-cdn.org/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes('/mediator/v1/categories/T/StudioMonthlyPrograms')) {
      return route.fulfill({
        json: {
          category: {
            key: 'StudioMonthlyPrograms',
            media: [
              { title: 'Programa de teste — Setembro', languageAgnosticNaturalKey: 'pub-jwb-teste-9_1_VIDEO', firstPublished: '2026-09-07T13:00:00Z' },
              { title: 'Programa de teste — Outubro', languageAgnosticNaturalKey: 'pub-jwb-teste-10_1_VIDEO', firstPublished: '2026-10-01T13:00:00Z' },
            ],
          },
        },
      });
    }
    const pub = u.searchParams.get('pub');
    if (pub === 'es26') {
      return route.fulfill({ json: { files: { T: { PDF: [{ title: 'Livro de teste', file: { url: ES_PDF, checksum: 'x' }, filesize: 139431 }] } } } });
    }
    if (pub === 'mwb' && opts.workbook && u.searchParams.get('issue') === '202609') {
      return route.fulfill({
        json: {
          files: {
            T: {
              RTF: [
                { title: '<strong>Baixar todos os arquivos (ZIP)</strong>' },
                { title: '28 de setembro a 4 de outubro (Jeremias 38 a 39)' },
                { title: '5 a 11 de outubro (Jeremias 40 a 41)' },
              ],
            },
          },
        },
      });
    }
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
  await page.route('https://cfp2.jw-cdn.org/**', (route) =>
    route.request().url() === ES_PDF && opts.esCors === false
      ? // Como o CDN real faz com outros sites: o navegador recusa (CORS) e o download falha.
        route.abort('accessdenied')
      : route.request().url() === ES_PDF
      ? route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          headers: { 'access-control-allow-origin': '*' },
          body: readFileSync(new URL('./fixtures/es-teste-2026.pdf', import.meta.url)),
        })
      : route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }),
  );
}

async function onboard(page: Page, day = SEXTA, opts: { workbook?: boolean; esCors?: boolean } = {}) {
  await mockOfficial(page, opts);
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
  const skip = player.getByRole('group', { name: 'Avançar ou voltar' });
  await expect(skip.getByRole('button', { name: 'Voltar 10 segundos' })).toBeVisible();
  await expect(skip.getByRole('button', { name: 'Avançar 10 segundos' })).toBeVisible();
  await skip.getByRole('button', { name: 'Avançar 30 segundos' }).click();
  await expect(player.getByText(/0:3\d \//)).toBeVisible();
  await skip.getByRole('button', { name: /Velocidade 1×/ }).click();
  await expect(skip.getByRole('button', { name: /Velocidade 1,25×/ })).toBeVisible();
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

test('leitura vem da apostila oficial; joias, designação com data e Alexa', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await onboard(page, SEXTA, { workbook: true });

  // Sem cadastrar nada: o trecho da semana vem dos títulos oficiais da apostila.
  const leitura = page.getByRole('region', { name: 'Leitura da Bíblia' });
  await expect(leitura.getByText('Jeremias 40:1–7')).toBeVisible();
  await page.getByRole('button', { name: 'Leitura', exact: true }).click();
  await expect(page.getByText('Apostila oficial')).toBeVisible();

  // Joias: links de pesquisa para cada capítulo da semana.
  await page.getByRole('button', { name: 'Reuniões', exact: true }).click();
  await page.getByRole('button', { name: 'Meio de semana' }).click();
  const pesquisa = page.getByLabel('Pesquisa da leitura da semana');
  await expect(pesquisa.getByRole('link', { name: 'Jeremias 41 com notas' })).toHaveAttribute('href', 'https://wol.jw.org/pt/wol/b/r5/lp-t/nwtsty/24/41');
  await expect(pesquisa.getByRole('link', { name: 'Matérias sobre Jeremias 40' })).toHaveAttribute('href', /wol\/s\/r5\/lp-t\?q=Jeremias%2040/);

  // Designação: escolhe a data entre as próximas reuniões.
  const des = page.getByRole('region', { name: 'Designações' });
  await des.getByLabel('Reunião').selectOption('fim:2026-10-11');
  await des.getByLabel('Tipo').selectOption('Leitor de A Sentinela');
  await des.getByRole('button', { name: 'Adicionar designação' }).click();
  await expect(des.locator('.row-title', { hasText: 'Leitor de A Sentinela' })).toBeVisible();
  await expect(des.getByText(/Fim de semana · Domingo, 11\/10/)).toBeVisible();
  await des.getByLabel('Reunião').selectOption('meio:2026-10-07');
  await des.getByLabel('Tipo').selectOption('Leitura da Bíblia');
  await des.getByRole('button', { name: 'Adicionar designação' }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  const prox = page.getByRole('region', { name: 'Designação próxima' });
  await expect(prox.locator('.card-title')).toHaveText('Leitura da Bíblia');

  // Alexa: copiar o comando.
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Alexa' }).click();
  await page.getByRole('button', { name: /Copiar o comando: Alexa, ler o texto diário/ }).click();
  await expect(page.getByText('Copiado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Alexa, ler o texto diário de hoje do jw.org');
});

test('texto diário: mostra só o dia, recortado do PDF oficial guardado no aparelho', async ({ page }) => {
  await onboard(page);
  let downloads = 0;
  page.on('request', (r) => {
    if (r.url() === ES_PDF) downloads++;
  });
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Ler aqui' }).click();
  const sheet = page.getByRole('dialog', { name: 'Texto diário' });
  await expect(sheet.getByRole('img', { name: /Texto diário de sexta-feira, 2 de outubro/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByText('Página do PDF oficial do jw.org, guardado neste aparelho.')).toBeVisible();
  // O recorte tem a largura da tela e a altura só do dia (bem menor que uma página inteira).
  const box = await sheet.locator('canvas.dt-page').first().boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeLessThan(box!.width * 2);
  // A página inteira do dia aparece (rolando a tela), sem ser cortada pela caixa.
  const pages = await sheet.locator('.dt-pages').boundingBox();
  expect(Math.abs(pages!.height - box!.height)).toBeLessThan(2);
  await sheet.getByRole('button', { name: 'Marcar como lido' }).scrollIntoViewIfNeeded();
  await expect(sheet.getByRole('button', { name: 'Marcar como lido' })).toBeInViewport();
  await sheet.getByRole('button', { name: 'Marcar como lido' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('region', { name: 'Texto diário' }).getByText('Feito')).toBeVisible();

  // No dia seguinte abre sem baixar de novo.
  await page.goto('/?hoje=2026-10-03');
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Ler aqui' }).click();
  await expect(page.getByRole('img', { name: /Texto diário de sábado, 3 de outubro/ }).first()).toBeVisible({ timeout: 30_000 });
  expect(downloads).toBe(1);
});

test('texto diário na web: CDN recusa, a pessoa escolhe o PDF baixado do jw.org', async ({ page }) => {
  await onboard(page, SEXTA, { esCors: false });
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Ler aqui' }).click();
  const sheet = page.getByRole('dialog', { name: 'Texto diário' });
  await expect(sheet.getByRole('link', { name: 'Baixar o PDF no jw.org' })).toHaveAttribute('href', ES_PDF);

  // Um arquivo qualquer é recusado e não fica guardado.
  const input = sheet.getByLabel('Escolher o arquivo baixado');
  await input.setInputFiles({ name: 'outro.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 nada') });
  await expect(sheet.getByText(/Esse arquivo não é o livro de 2026|Não foi possível abrir esse arquivo/)).toBeVisible({ timeout: 30_000 });

  await input.setInputFiles(fileURLToPath(new URL('./fixtures/es-teste-2026.pdf', import.meta.url)));
  await expect(sheet.getByRole('img', { name: /Texto diário de sexta-feira, 2 de outubro/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByRole('link', { name: 'Baixar o PDF no jw.org' })).toBeHidden();

  // Depois abre direto, sem pedir o arquivo de novo.
  await page.goto('/?hoje=2026-10-03');
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Ler aqui' }).click();
  await expect(page.getByRole('img', { name: /Texto diário de sábado, 3 de outubro/ }).first()).toBeVisible({ timeout: 30_000 });
});

test('app instalado pelo navegador avisa quando há versão nova', async ({ page }) => {
  await onboard(page);
  await expect(page.getByText('Há uma versão nova do app.')).toBeHidden();
  // O servidor passa a responder com outro script principal (nova publicação).
  await page.route(/\/$/, (route) =>
    route.request().resourceType() === 'fetch'
      ? route.fulfill({ contentType: 'text/html', body: '<script type="module" src="/assets/index-Nova123.js"></script>' })
      : route.continue(),
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Há uma versão nova do app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
});

test('texto diário: ouvir com a voz do aparelho', async ({ page }) => {
  // Voz simulada: guarda o que seria falado e termina na hora.
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak(u: SpeechSynthesisUtterance) {
          said.push(`${u.lang}|${u.rate}|${u.text}`);
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 30);
        },
        cancel() {},
        getVoices: () => [],
      },
    });
  });
  await onboard(page);
  await page.getByRole('region', { name: 'Texto diário' }).getByRole('button', { name: 'Ler aqui' }).click();
  const sheet = page.getByRole('dialog', { name: 'Texto diário' });
  await expect(sheet.getByRole('img', { name: /Texto diário de sexta-feira, 2 de outubro/ }).first()).toBeVisible({ timeout: 30_000 });
  await sheet.getByLabel('Velocidade').selectOption('0.8');
  await sheet.getByRole('button', { name: 'Ouvir' }).click();
  await expect(sheet.getByRole('button', { name: 'Ouvir' })).toBeVisible();
  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said.join(' '));
  expect(said).toMatch(/^pt-BR\|0\.8\d*\|Sexta-feira, 2 de outubro\. Linha 1 do dia 2\/10, teste\./);
  expect(said).toContain('Linha 14 do dia 2/10');
  expect(said).not.toContain('do dia 3/10');
});

test('estudo pessoal e adoração em família com dias e horários; lembretes ajustáveis', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Estudo', exact: true }).click();
  const est = page.getByRole('region', { name: 'Estudo pessoal' });
  const dias = est.getByRole('group', { name: 'Dias do estudo pessoal' });
  await dias.getByRole('button', { name: 'Seg' }).click();
  await dias.getByRole('button', { name: 'Sex' }).click();
  await expect(dias.getByRole('button', { name: 'Sex' })).toHaveAttribute('aria-pressed', 'true');
  await est.getByLabel('Horário').fill('21:15');
  await expect(est.getByText('Hoje é dia de estudo pessoal.')).toBeVisible();

  const fam = page.getByRole('region', { name: 'Adoração em família' });
  await fam.getByRole('group', { name: 'Dia da adoração em família' }).getByRole('button', { name: 'Qui' }).click();
  await fam.getByLabel('Horário').fill('20:00');

  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Estudo pessoal' }).getByText('Hoje · 21h15')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const lem = page.getByRole('region', { name: 'Lembretes' });
  await expect(lem.getByText('Segunda-feira e sexta-feira, às 21h15. Mude na aba Estudo.')).toBeVisible();
  await expect(lem.getByText('Quinta-feira, às 20h. Mude na aba Estudo.')).toBeVisible();
  const quando = lem.getByRole('group', { name: 'Quando lembrar da reunião de meio de semana' });
  await expect(quando.getByRole('button', { name: 'Véspera (ter)' })).toHaveAttribute('aria-pressed', 'true');
  await quando.getByRole('button', { name: '2 dias antes (seg)' }).click();
  await expect(quando.getByRole('button', { name: '2 dias antes (seg)' })).toHaveAttribute('aria-pressed', 'true');

  // Fica guardado (a gravação no aparelho é assíncrona).
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Lembretes' }).getByRole('button', { name: '2 dias antes (seg)' })).toHaveAttribute('aria-pressed', 'true');
});

test('adoração em família sugere o programa mensal da JW Broadcasting', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Estudo', exact: true }).click();
  const fam = page.getByRole('region', { name: 'Adoração em família' });
  await expect(fam.getByText('Assistir ao programa mensal da JW Broadcasting e conversar')).toBeVisible();
  await expect(fam.getByText('Programa de teste — Outubro. Abre no JW Library, se estiver instalado.')).toBeVisible();
  await expect(fam.getByRole('link', { name: 'Assistir ao programa do mês' })).toHaveAttribute(
    'href',
    'https://www.jw.org/finder?srcid=jwlshare&wtlocale=T&lank=pub-jwb-teste-10_1_VIDEO',
  );
  // Depois de registrar que assistiram, a próxima ideia é outra.
  await fam.getByRole('button', { name: 'Registrar adoração de hoje' }).click();
  await expect(fam.getByRole('link', { name: 'Assistir ao programa do mês' })).toBeHidden();
});

test('ministério: lança horas e minutos em outro dia', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: /Pioneiro auxiliar/ }).click();
  await page.getByRole('button', { name: 'Ministério', exact: true }).click();
  const reg = page.getByRole('region', { name: 'Registrar saída' });
  await reg.getByLabel('Data').fill('2026-10-01');
  await expect(reg.getByText('Lançando para qui, 1/10.')).toBeVisible();
  await expect(reg.getByRole('button', { name: 'Iniciar' })).toBeHidden();
  await reg.getByLabel('Horas').fill('1');
  await reg.getByLabel('Minutos').fill('30');
  await reg.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('1h30 lançados em qui, 1/10.')).toBeVisible();
  await expect(reg.locator('.day-row', { hasText: 'qui, 1/10' }).getByText('1h30')).toBeVisible();
  // Do mês anterior também vale (conta no mês daquela data).
  await reg.getByLabel('Data').fill('2026-09-29');
  await reg.getByLabel('Horas').fill('2');
  await reg.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('2h lançados em ter, 29/9 (conta no mês daquela data).')).toBeVisible();
  // Voltando para hoje, o cronômetro aparece de novo.
  await reg.getByLabel('Data').fill('2026-10-02');
  await expect(reg.getByRole('button', { name: 'Iniciar' })).toBeVisible();
});

test('versão web convida a instalar o app (atalho na tela inicial)', async ({ page }) => {
  await onboard(page);
  const card = page.getByRole('region', { name: 'Instalar o app' });
  // Sem o convite do navegador (e fora do iPhone), não aparece nada no Hoje.
  await expect(card).toBeHidden();

  const offer = (outcome: 'accepted' | 'dismissed') =>
    page.evaluate((o) => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      (window as unknown as { __prompted: number }).__prompted = 0;
      e.prompt = async () => {
        (window as unknown as { __prompted: number }).__prompted++;
      };
      e.userChoice = Promise.resolve({ outcome: o });
      window.dispatchEvent(e);
    }, outcome);

  await offer('dismissed');
  await expect(card.getByText('Instale o StudyRoutine')).toBeVisible();
  await card.getByRole('button', { name: 'Instalar' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  // Recusou no pedido do navegador: some do Hoje por um tempo, mesmo com novo convite.
  await expect(card).toBeHidden();
  await page.waitForTimeout(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Seu dia' })).toBeVisible();
  await offer('accepted');
  await expect(card).toBeHidden();
  // Em Ajustes continua disponível.
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await card.getByRole('button', { name: 'Instalar' }).click();
  await expect(card).toBeHidden(); // aceitou: já instalado
});
