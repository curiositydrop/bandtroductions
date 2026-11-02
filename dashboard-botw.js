// Homepage Band of the Week card (revamp): pre-launch champ / voting week + leader / Sunday winner.
import { currentRound, roundFor, rankRound, loadVotes, loadRounds, loadDirectory, slugify } from './botw-core.js?v=1';

const panel = [...document.querySelectorAll('.right .panel')].find(p => p.querySelector('h3')?.textContent.trim() === 'Band of the Week');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (panel) (async () => {
  const body = panel.querySelector('div');
  try {
    const round = currentRound();
    const [dir, rounds, votes] = await Promise.all([loadDirectory(), loadRounds(), round.state === 'prelaunch' ? [] : loadVotes(round.weekId).catch(() => [])]);
    const info = id => dir.get(id) || { name: id.replace(/-/g, ' '), image: 'IMG_9367.png', url: `${id}.html` };
    const ranked = rankRound(votes);
    const card = (id, tag, line, btn, href) => { const b = info(id); return `<a href="${esc(b.url)}" style="display:block;text-decoration:none;color:inherit"><img src="${esc(b.image)}" alt="${esc(b.name)}" style="width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid #333;margin-bottom:8px"><small style="display:block;color:#ffcc33;font-weight:900;letter-spacing:.08em;font-size:.7em">${esc(tag)}</small><b style="display:block;color:var(--teal);font-size:1.05em;line-height:1.15">${esc(b.name)}</b><p style="color:var(--muted);margin:5px 0">${esc(line)}</p></a><a class="btn${btn === 'VOTE NOW' ? ' primary' : ''}" href="${href}">${btn}</a>`; };
    let html;
    if (round.state === 'voting') {
      const lead = ranked.list[0];
      const head = `<small style="display:block;color:#ff004c;font-weight:900;letter-spacing:.08em;font-size:.7em">● VOTING LIVE · ${esc(round.label.toUpperCase())}</small><p style="color:var(--muted);margin:4px 0 8px">Closes Sat 11:59 PM ET</p>`;
      html = lead ? head + card(lead.bandId, 'CURRENT LEADER', `${lead.votes} vote${lead.votes === 1 ? '' : 's'}`, 'VOTE NOW', 'band-of-the-week.html')
                  : head + '<p style="color:var(--muted)">No votes yet. Be the first!</p><a class="btn primary" href="band-of-the-week.html">VOTE NOW</a>';
    } else if (round.state === 'results') {
      const fin = rounds.find(r => r.weekId === round.weekId && !r.seed);
      const w = (fin?.winners || ranked.winners)[0];
      html = w ? card(w, `🏆 BAND OF THE WEEK · ${round.shortLabel.toUpperCase()}`, `WINNER · ${(fin?.results || ranked.list).find(x => x.bandId === w)?.votes || 0} votes`, 'VIEW PROFILE', esc(info(w).url)) + '<a class="btn" style="margin-top:6px" href="band-of-the-week.html">HALL OF FAME</a>'
               : '<p style="color:var(--muted)">New round opens Monday.</p><a class="btn" href="band-of-the-week.html">VIEW PAGE</a>';
    } else {
      const seed = rounds.find(r => r.seed);
      html = (seed ? card(seed.winners[0], '👑 REIGNING CHAMP', 'All-new Band of the Week returns Mon Nov 9', 'SEE WHAT’S COMING', 'band-of-the-week.html') : '<p style="color:var(--muted)">All-new Band of the Week returns Mon Nov 9.</p><a class="btn" href="band-of-the-week.html">LEARN MORE</a>');
    }
    body.style.padding = '12px'; body.innerHTML = html;
  } catch (e) { console.warn('BOTW card', e); body.innerHTML = '<p style="color:#888">Band of the Week</p><a class="btn" href="band-of-the-week.html">VIEW</a>'; }
})();
