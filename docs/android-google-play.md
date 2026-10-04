# Android e Google Play

O app Android é a mesma interface web empacotada com Capacitor 8 (`app/android`). Diferente de um TWA, ele funciona offline, agenda lembretes locais e chama o serviço de metadados do áudio pelo lado nativo (`CapacitorHttp`).

## Identidade

| Item | Valor |
|---|---|
| applicationId | `br.com.j2bot.studyroutine` (não muda depois da primeira publicação) |
| Nome | StudyRoutine |
| minSdk / targetSdk | 24 / 36 (confira o mínimo exigido pela Play na época do envio) |
| Servidor de sincronização | `VITE_SYNC_ORIGIN` no build (ex.: `https://studyroutine.j2bot.com.br`) |
| Permissões | Internet; notificações (Android 13+, pedida só ao ligar lembretes); iniciar após reinício (para reagendar lembretes). `SCHEDULE_EXACT_ALARM` é removida no manifesto. |

## Build local

Requisitos: Node 22, JDK 21 e Android Studio (SDK 36).

```bash
cd app
cp .env.example .env                 # confira VITE_SYNC_ORIGIN; deixe VITE_ALLOW_DATE_OVERRIDE vazio
npm ci
npm run build
npx cap sync android
npx cap open android                 # rodar no emulador ou no celular
```

Ícones e telas de abertura são gerados de `app/resources/*.svg` por `node scripts/gerar-icones.mjs` (já gerados no repositório).

## Chave de upload

Uma vez, guardando o arquivo e as senhas num cofre de senhas:

```bash
keytool -genkeypair -v -keystore studyroutine-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Depois copie `app/android/keystore.properties.example` para `app/android/keystore.properties` (fica fora do Git) e preencha. Com a Assinatura de apps do Google Play, essa é só a chave de upload: se perder, dá para pedir a troca ao suporte.

## Gerar o AAB

Local:

```bash
cd app/android
VERSION_CODE=1 VERSION_NAME=0.1.0 ./gradlew bundleRelease
# app/build/outputs/bundle/release/app-release.aab
```

Pelo GitHub Actions: workflow **Android (AAB)** (manual), com os segredos `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` e a variável `SYNC_ORIGIN`.

`versionCode` precisa crescer a cada envio.

## Antes do primeiro envio

1. Servidor no ar com HTTPS, `/privacidade` e `/excluir-dados` acessíveis publicamente.
2. Testar no celular: lembretes (Android 13+ pede permissão), links abrindo no JW Library, áudio oficial tocando a porção do dia, sincronização entre dois aparelhos, modo escuro, TalkBack nos botões principais.
3. Política de privacidade revisada (ver [privacidade-e-retencao.md](privacidade-e-retencao.md)).
4. Busca do nome no INPI e na Play.

## Play Console

- **Conta pessoal nova:** a Play exige um teste fechado com um número mínimo de testadores ativos por um período contínuo antes de liberar a produção (na regra vigente quando este guia foi escrito, 12 testadores por 14 dias). Confira o requisito atual no Console.
- **Ficha da loja:** [play-store/ficha-da-loja.md](play-store/ficha-da-loja.md).
- **Segurança dos dados:** [play-store/seguranca-dos-dados.md](play-store/seguranca-dos-dados.md).
- **Exclusão de dados:** URL `https://studyroutine.j2bot.com.br/excluir-dados`.
- **Classificação de conteúdo:** questionário IARC (sem violência, sem interação entre usuários, sem compras).
- **Público-alvo:** maiores de 13 anos é o caminho mais simples; incluir crianças traz as exigências da política Famílias.
- **Anúncios:** não contém. **Preço:** gratuito, sem compras no app.
- **Declaração de independência:** deixar claro na descrição que o app não é oficial nem afiliado ao jw.org, e não usar o nome JW.ORG, logotipos ou imagens do site nos gráficos da loja.
