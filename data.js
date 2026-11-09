const API_KEY = "1765373376823c3dfda52907da564c04";
const HOST = "v3.football.api-sports.io";
const BASE_URL = `https://${HOST}`;
const LEAGUE_ID = 1;
const SEASON = 2022;

function authHeaders(){
  return { "x-apisports-key": API_KEY };
}

const cache = {};

async function apiGet(path, params){
  const key = path + "?" + new URLSearchParams(params || {}).toString();
  if(cache[key]) return cache[key];

  const url = new URL(BASE_URL + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const req = fetch(url, { headers: authHeaders() })
    .then(r => r.json())
    .then(json => json.response || []);

  cache[key] = req;
  return req;
}

function mapStatus(short){
  if(["1H","2H","HT","ET","P","LIVE","BT"].includes(short)) return "LIVE";
  if(["FT","AET","PEN"].includes(short)) return "FT";
  return "UPCOMING";
}

function mapWinner(f){
  if(mapStatus(f.fixture.status.short) !== "FT") return null;
  if(f.teams.home.winner === true) return "home";
  if(f.teams.away.winner === true) return "away";
  return "draw";
}

function mapFixture(f){
  return {
    id: f.fixture.id,
    competition: f.league.name,
    home_team: f.teams.home.name,
    away_team: f.teams.away.name,
    home_logo: f.teams.home.logo,
    away_logo: f.teams.away.logo,
    home_score: f.goals.home,
    away_score: f.goals.away,
    status: mapStatus(f.fixture.status.short),
    minute: f.fixture.status.elapsed,
    kickoff_utc: f.fixture.date,
    winner: mapWinner(f),
    round: f.league.round
  };
}

function roundStage(round){
  const r = round.toLowerCase();
  if(r.includes('3rd')) return 'Third Place';
  if(r.includes('final') && !r.includes('quarter') && !r.includes('semi')) return 'Final';
  if(r.includes('semi')) return 'Semi-Finals';
  if(r.includes('quarter')) return 'Quarter-Finals';
  if(r.includes('16')) return 'Round of 16';
  return null;
}

async function getKnockoutMatches(){
  const all = await getAllMatches();
  const stages = { 'Round of 16': [], 'Quarter-Finals': [], 'Semi-Finals': [], 'Final': [], 'Third Place': [] };
  all.forEach(m => {
    const stage = roundStage(m.round);
    if(stage) stages[stage].push(m);
  });
  return stages;
}

async function getAllMatches(){
  const fixtures = await apiGet("/fixtures", { league: LEAGUE_ID, season: SEASON });
  return fixtures.map(mapFixture);
}

async function getMatchById(id){
  const fixtures = await apiGet("/fixtures", { id });
  return fixtures.length ? mapFixture(fixtures[0]) : null;
}

async function getStandingsByGroup(group){
  const standings = await apiGet("/standings", { league: LEAGUE_ID, season: SEASON });
  if(!standings.length) return [];
  const allGroups = standings[0].league.standings;
  const groupRows = allGroups.find(g => g[0] && g[0].group && g[0].group.endsWith(group)) || [];
  return groupRows.map(row => ({
    code: row.team.name.slice(0,3).toUpperCase(),
    name: row.team.name,
    logo: row.team.logo,
    played: row.all.played,
    won: row.all.win,
    drawn: row.all.draw,
    lost: row.all.lose,
    gf: row.all.goals.for,
    ga: row.all.goals.against,
    pts: row.points,
    group_name: group
  }));
}

async function getAllTeams(){
  const teams = await apiGet("/teams", { league: LEAGUE_ID, season: SEASON });
  const standings = await apiGet("/standings", { league: LEAGUE_ID, season: SEASON });
  const groups = standings.length ? standings[0].league.standings : [];

  return teams.map(t => {
    let group_name = "-", pts = 0, played = 0;
    for(const g of groups){
      const row = g.find(r => r.team.id === t.team.id);
      if(row){
        group_name = row.group.replace("Group ", "");
        pts = row.points;
        played = row.all.played;
        break;
      }
    }
    return {
      code: t.team.name.slice(0,3).toUpperCase(),
      name: t.team.name,
      logo: t.team.logo,
      group_name,
      pts,
      played
    };
  });
}

async function getTeamByCode(code){
  const teams = await getAllTeams();
  return teams.find(t => t.code === code) || null;
}

async function getStatsForMatch(matchId){
  const stats = await apiGet("/fixtures/statistics", { fixture: matchId });
  if(stats.length < 2) return null;

  const find = (arr, type) => (arr.find(s => s.type === type) || {}).value ?? 0;
  const home = stats[0].statistics, away = stats[1].statistics;

  return {
    possession: [find(home,"Ball Possession"), find(away,"Ball Possession")],
    shots: [find(home,"Total Shots"), find(away,"Total Shots")],
    shots_on_target: [find(home,"Shots on Goal"), find(away,"Shots on Goal")],
    corners: [find(home,"Corner Kicks"), find(away,"Corner Kicks")],
    fouls: [find(home,"Fouls"), find(away,"Fouls")]
  };
}

async function getLineupsForMatch(matchId){
  const lineups = await apiGet("/fixtures/lineups", { fixture: matchId });
  if(lineups.length < 2) return null;

  const side = l => ({
    formation: l.formation,
    starters: l.startXI.map(p => p.player.name)
  });

  return { home: side(lineups[0]), away: side(lineups[1]) };
}

async function getEventsForMatch(matchId){
  const [events, fixtures] = await Promise.all([
    apiGet("/fixtures/events", { fixture: matchId }),
    apiGet("/fixtures", { id: matchId })
  ]);
  const homeTeamId = fixtures.length ? fixtures[0].teams.home.id : null;

  return events
    .filter(e => ["Goal","Card"].includes(e.type))
    .map(e => ({
      minute: e.time.elapsed,
      type: e.type === "Goal" ? "goal" : (e.detail === "Red Card" ? "red" : "yellow"),
      player: e.player.name,
      team: e.team.id === homeTeamId ? "home" : "away"
    }));
}

async function getMotmForMatch(matchId){
  const players = await apiGet("/fixtures/players", { fixture: matchId });
  if(!players.length) return null;

  let best = null;
  players.forEach(side => {
    side.players.forEach(p => {
      const stat = p.statistics[0];
      const rating = parseFloat(stat.games.rating);
      if(!rating) return;
      if(!best || rating > best.rating){
        best = {
          name: p.player.name,
          photo: p.player.photo,
          team: side.team.name,
          rating: rating.toFixed(1),
          goals: stat.goals.total || 0
        };
      }
    });
  });
  return best;
}
