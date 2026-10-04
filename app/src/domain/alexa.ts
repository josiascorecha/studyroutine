/**
 * Comandos de voz da skill oficial JW.ORG para Amazon Alexa, conforme a página de ajuda do jw.org
 * (https://www.jw.org/pt/ajuda-online/como-usar-jw-org/skills-para-amazon-alexa/, conferida em 04/10/2026).
 * O app não aciona a Alexa: só mostra o comando certo para a pessoa falar ou usar numa Rotina.
 */
export const alexa = {
  dailyText: () => 'Alexa, ler o texto diário de hoje do jw.org',
  /** Texto para a ação "Personalizado" de uma Rotina da Alexa (sem a palavra "Alexa"). */
  dailyTextRoutine: () => 'ler o texto diário de hoje do jw.org',
  chapter: (bookName: string, chapter: number) => `Alexa, tocar ${bookName} capítulo ${chapter} do jw.org`,
  weekReading: (phrase: 'desta semana' | 'da semana que vem') => `Alexa, ler a leitura da Bíblia ${phrase} do jw.org`,
  watchtower: () => 'Alexa, ler o estudo de A Sentinela desta semana do jw.org',
  congregationStudy: () => 'Alexa, ler o estudo bíblico de congregação desta semana do jw.org',
  workbook: () => 'Alexa, leia a programação da Apostila da Reunião dessa semana do jw.org',
  lffLesson: (n: number) => `Alexa, leia Seja Feliz para Sempre! lição ${n} do jw.org`,
};
