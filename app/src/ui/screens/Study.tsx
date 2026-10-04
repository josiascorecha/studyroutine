import { useState } from 'react';
import { allThemes, themeLabel, TIPO_LABELS, useCatalog, type CatalogItem } from '../../app/catalog';
import { useRepoVersion, useServices } from '../../app/context';
import type { DayView } from '../../app/derive';
import { FAMILY_FORMATS, familyLog, newId, saveSettings, savedLinks, T, type FamilyWorship, type SavedLink } from '../../app/model';
import { openExternal } from '../../app/platform';
import { addDays, dayWordDm, shortDay, weekday, type DayKey } from '../../domain/dates';
import { isOfficialUrl, links } from '../../domain/links';
import { Chips, ExternalLink, PageHead } from '../components';
import type { Nav } from '../App';

const DAY_OPTIONS = [
  { v: 0, label: 'Dom' },
  { v: 1, label: 'Seg' },
  { v: 2, label: 'Ter' },
  { v: 3, label: 'Qua' },
  { v: 4, label: 'Qui' },
  { v: 5, label: 'Sex' },
  { v: 6, label: 'Sáb' },
];

/** Próxima data (hoje inclusive) que cai no dia da semana escolhido. */
export function nextOnWeekday(cur: DayKey, day: number): DayKey {
  const diff = (day - weekday(cur) + 7) % 7;
  return addDays(cur, diff);
}

export function Study({ view, nav }: { view: DayView; nav: Nav }) {
  const { repo } = useServices();
  useRepoVersion();
  const { s, cur } = view;
  const catalog = useCatalog(repo);
  const themes = allThemes(catalog);
  const log = familyLog(repo);
  const links_ = savedLinks(repo);
  const seen = new Set(repo.list<boolean>(T.seen).filter((r) => r.data).map((r) => r.key));

  const [shift, setShift] = useState(0);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTheme, setNewTheme] = useState('estudo-pessoal');
  const [showAll, setShowAll] = useState(false);

  const save = (patch: Parameters<typeof saveSettings>[1]) => void saveSettings(repo, patch);
  const toggleTheme = (t: string) => save({ themes: s.themes.includes(t) ? s.themes.filter((x) => x !== t) : [...s.themes, t] });

  // Adoração em família: sugere o formato seguinte ao último usado, para variar.
  const lastFormat = log[0]?.data.format;
  const baseIndex = lastFormat ? (FAMILY_FORMATS.indexOf(lastFormat) + 1) % FAMILY_FORMATS.length : 0;
  const suggestion = FAMILY_FORMATS[(baseIndex + shift) % FAMILY_FORMATS.length];
  const doneToday = log.find((x) => x.data.date === cur);
  const nextFamily = s.familyDay === null ? null : nextOnWeekday(cur, s.familyDay);

  const filtered = catalog.itens.filter((it) => s.themes.length === 0 || it.temas.some((t) => s.themes.includes(t)));
  const ordered = [...filtered].sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
  const visible = showAll ? ordered : ordered.slice(0, 5);

  const addLink = () => {
    const url = newUrl.trim();
    const title = newTitle.trim();
    if (!isOfficialUrl(url)) return nav.notify('Use um link do jw.org ou da Biblioteca On-line (wol.jw.org), começando com https://.');
    if (!title) return nav.notify('Dê um título com suas palavras para lembrar do que se trata.');
    void repo.put<SavedLink>(T.link, newId(), { url, title: title.slice(0, 120), theme: newTheme, added: cur });
    setNewUrl('');
    setNewTitle('');
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Estudo pessoal e família" title="Estudo" />

      <section className="card" aria-label="Adoração em família">
        <div className="card-head">
          <h2>Adoração em família</h2>
          {doneToday && <span className="pill ok">Feita hoje</span>}
        </div>
        <span className="field-title">Dia fixo</span>
        <Chips
          label="Dia da adoração em família"
          options={DAY_OPTIONS}
          value={s.familyDay ?? -1}
          onChange={(v) => save({ familyDay: v === s.familyDay ? null : v })}
        />
        {nextFamily && (
          <div className="muted">
            {nextFamily === cur ? 'Hoje é o dia da adoração em família.' : `Próxima: ${dayWordDm(nextFamily)}.`}
          </div>
        )}
        <div className="box">
          <div className="small">Ideia para esta semana</div>
          <div className="row-title">{suggestion}</div>
          <div className="row-btns">
            <button type="button" className="btn ghost" onClick={() => setShift(shift + 1)}>
              Outra ideia
            </button>
            <ExternalLink href={links.wolDoc(2024247)} className="btn ghost">
              Ideias no jw.org
            </ExternalLink>
          </div>
        </div>
        {!doneToday && (
          <>
            <label className="field">
              Anotação (opcional)
              <input className="input" value={note} placeholder="O que fizeram, quem participou" onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void repo.put<FamilyWorship>(T.family, cur, { date: cur, format: suggestion, note: note.trim().slice(0, 300) });
                setNote('');
                setShift(0);
              }}
            >
              Registrar adoração de hoje
            </button>
          </>
        )}
        {log.slice(0, 4).map((x) => (
          <div className="day-row" key={x.key}>
            <div className="day">{shortDay(x.data.date)}</div>
            <div className="body">
              <div className="row-title">{x.data.format}</div>
              {x.data.note && <div className="small">{x.data.note}</div>}
            </div>
            <button type="button" className="btn ghost" aria-label={`Remover adoração de ${shortDay(x.data.date)}`} onClick={() => void repo.remove(T.family, x.key)}>
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Sugestões de estudo">
        <h2>Sugestões do jw.org</h2>
        <div className="muted">Escolha temas de interesse. As sugestões são links para matérias do jw.org, escolhidas a dedo.</div>
        <div className="chips wrap" role="group" aria-label="Temas de interesse">
          {themes.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={s.themes.includes(t)} onClick={() => toggleTheme(t)}>
              {themeLabel(t)}
            </button>
          ))}
        </div>
        {visible.length === 0 && <div className="small">Nenhuma sugestão para esses temas ainda.</div>}
        {visible.map((it) => (
          <Suggestion key={it.id} item={it} seen={seen.has(it.id)} onSeen={(v) => void repo.put<boolean>(T.seen, it.id, v)} />
        ))}
        {ordered.length > 5 && (
          <button type="button" className="btn ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Mostrar menos' : `Ver todas (${ordered.length})`}
          </button>
        )}
      </section>

      <section className="card" aria-label="Pesquisar">
        <h2>Pesquisar um tema</h2>
        <div className="muted">Abre a pesquisa da Biblioteca On-line da Torre de Vigia.</div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) openExternal(links.wolSearch(query.trim()));
          }}
        >
          <label className="field" style={{ flex: 1 }}>
            Tema
            <input className="input" type="search" value={query} placeholder="Ex.: paciência, oração, ansiedade" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="submit" className="btn">
            Pesquisar
          </button>
        </form>
      </section>

      <section className="card" aria-label="Meus links">
        <h2>Meus links</h2>
        <div className="muted">Guarde matérias do jw.org para estudar depois. No JW Library ou no site, use Compartilhar › Copiar link e cole aqui.</div>
        {links_.map(({ key, data }) => (
          <div className="box" key={key}>
            <div className="card-head">
              <span className="row-title">{data.title}</span>
              <span className="pill">{themeLabel(data.theme)}</span>
            </div>
            <div className="row-btns">
              <ExternalLink href={data.url}>Abrir</ExternalLink>
              <button type="button" className="btn ghost" onClick={() => void repo.remove(T.link, key)}>
                Remover
              </button>
            </div>
          </div>
        ))}
        <label className="field">
          Link do jw.org
          <input className="input" type="url" inputMode="url" value={newUrl} placeholder="https://www.jw.org/pt/…" onChange={(e) => setNewUrl(e.target.value)} />
        </label>
        <label className="field">
          Título, com suas palavras
          <input className="input" value={newTitle} placeholder="Ex.: Como ser mais paciente" onChange={(e) => setNewTitle(e.target.value)} />
        </label>
        <label className="field">
          Tema
          <select className="input" value={newTheme} onChange={(e) => setNewTheme(e.target.value)}>
            {Array.from(new Set(['estudo-pessoal', 'adoracao-em-familia', ...themes])).map((t) => (
              <option key={t} value={t}>
                {themeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={addLink}>
          Salvar link
        </button>
      </section>
    </div>
  );
}

function Suggestion({ item, seen, onSeen }: { item: CatalogItem; seen: boolean; onSeen: (v: boolean) => void }) {
  return (
    <div className="box">
      <div className="card-head">
        <span className="row-title">{item.titulo}</span>
        <span className={seen ? 'pill ok' : 'pill'}>{seen ? 'Visto' : TIPO_LABELS[item.tipo]}</span>
      </div>
      <div className="small">{item.descricao}</div>
      <div className="row-btns">
        <ExternalLink href={item.url}>Abrir</ExternalLink>
        <button type="button" className="btn ghost" aria-pressed={seen} onClick={() => onSeen(!seen)}>
          {seen ? 'Desmarcar' : 'Já vi'}
        </button>
      </div>
    </div>
  );
}
