import {parseCatalogSnapshots} from '@/lib/importer/ported2browserHtml';

const page = (number: number, total: number, cards: string) => `
  <div data-total="${total}">${cards}</div>
  <nav><span>Page ${number}</span></nav>`;
const card = (id: string, title: string, author: string, extra = '') => `
  <article class="card ${extra.includes('is-broken') ? 'is-broken' : ''}" data-port-id="${id}">
    <a href="https://ported2browser.com/ports/${id}">
      <img src="https://ported2browser.com/storage/covers/${id}.webp" alt="${title}">
      ${extra}
      <h2>${title}</h2><p>${author}</p>
    </a>
  </article>`;

describe('Ported2Browser HTML discovery', () => {
  it('deduplicates preloaded cards and verifies catalogue completeness', () => {
    const result = parseCatalogSnapshots([
      {source: 'p1.html', html: page(1, 2, card('A1', 'Alpha &amp; One', 'Alice', '<b class="recomp-tag">Recomp</b>'))},
      {
        source: 'p2.html',
        html: page(
          2,
          2,
          card('A1', 'Alpha &amp; One', 'Alice') +
            card('B2', 'Beta', 'Bob', '<b class="alert-badge" title="Link broken"></b><b class="fangame-tag">Fangame</b> is-broken'),
        ),
      },
    ]);

    expect(result).toMatchObject({declaredTotal: 2, pagesSeen: [1, 2], complete: true, duplicateIds: ['A1']});
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({sourceId: 'A1', title: 'Alpha & One', portAuthor: 'Alice'});
    expect(result.entries[1]).toMatchObject({sourceId: 'B2', tags: ['Fangame'], broken: true, alert: 'Link broken'});
  });

  it('does not claim completeness when snapshots are missing', () => {
    const result = parseCatalogSnapshots([{source: 'p1.html', html: page(1, 3, card('A1', 'Alpha', 'Alice'))}]);
    expect(result).toMatchObject({declaredTotal: 3, complete: false});
  });
});
