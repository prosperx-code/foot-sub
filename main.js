document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if(toggle && links){
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  buildTicker();
  wireSearch();
  wireFilterChips();
  wireTabs();
});

async function buildTicker(){
  const track = document.querySelector('.ticker-track');
  if(!track) return;

  const matches = await getAllMatches();
  const items = matches.map(m => {
    const isLive = m.status === 'LIVE';
    const scoreText = (m.home_score ?? '-') + ' – ' + (m.away_score ?? '-');
    const rightBit = isLive
      ? `<span class="min">${m.minute}'</span>`
      : (m.status === 'FT' ? 'FT' : new Date(m.kickoff_utc).toLocaleDateString(undefined,{month:'short',day:'numeric'}));
    return `
      <div class="ticker-item">
        ${isLive ? '<span class="live-dot"></span>' : ''}
        <span>${m.home_team}</span>
        <span class="score">${scoreText}</span>
        <span>${m.away_team}</span>
        <span>${rightBit}</span>
      </div>`;
  }).join('');

  track.innerHTML = items + items;
}

function wireSearch(){
  const input = document.querySelector('#global-search');
  const button = document.querySelector('#global-search-btn');
  const results = document.querySelector('#search-results');
  if(!input || !results) return;

  let debounceTimer;

  async function runSearch(){
    const q = input.value.trim().toLowerCase();
    if(q.length === 0){ results.classList.add('hidden'); results.innerHTML = ''; return; }

    results.classList.remove('hidden');
    results.innerHTML = '<div class="search-empty">Searching…</div>';

    const [allMatches, allTeams] = await Promise.all([getAllMatches(), getAllTeams()]);

    const matchHits = allMatches.filter(m =>
      m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q) || m.competition.toLowerCase().includes(q)
    );
    const teamHits = allTeams.filter(t => t.name.toLowerCase().includes(q));

    if(matchHits.length === 0 && teamHits.length === 0){
      results.innerHTML = '<div class="search-empty">No matches or teams found for “' + input.value + '”.</div>';
      return;
    }

    let html = '';
    matchHits.slice(0,6).forEach(m => {
      const scoreText = m.status === 'UPCOMING' ? 'vs' : (m.home_score + ' - ' + m.away_score);
      html += `<a class="search-result-row" href="match-details.html?id=${m.id}">
        <span>${m.home_team} ${scoreText} ${m.away_team}</span>
        <span>${m.status}</span>
      </a>`;
    });
    teamHits.slice(0,6).forEach(t => {
      html += `<a class="search-result-row" href="team-details.html?code=${t.code}">
        <span>${t.name}</span>
        <span>Group ${t.group_name}</span>
      </a>`;
    });
    results.innerHTML = html;
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 350);
  });
  if(button) button.addEventListener('click', runSearch);
}

function wireFilterChips(){
  const chips = document.querySelectorAll('.filter-chip');
  if(!chips.length) return;
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      document.querySelectorAll('[data-status]').forEach(card => {
        card.style.display = (filter === 'all' || card.dataset.status === filter) ? '' : 'none';
      });
    });
  });
}

function wireTabs(){
  const tabButtons = document.querySelectorAll('.tab-btn');
  if(!tabButtons.length) return;
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.tabs').dataset.group;
      document.querySelectorAll(`.tab-btn[data-group-ref="${group}"]`).forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`.tab-panel[data-group-ref="${group}"]`).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-panel[data-tab="${btn.dataset.tab}"][data-group-ref="${group}"]`).classList.add('active');
    });
  });
}

function crestImg(logo, code, size){
  const s = size || 24;
  if(logo){
    return `<img class="crest" style="width:${s}px;height:${s}px;" src="${logo}" alt="${code}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest',textContent:'${code}',style:'width:${s}px;height:${s}px;'}))">`;
  }
  return `<span class="crest" style="width:${s}px;height:${s}px;">${code}</span>`;
}

function getQueryParam(name){
  return new URLSearchParams(window.location.search).get(name);
}
