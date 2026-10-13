// README'deki XOX oyunu: issue basligindan hamleyi okur, botun cevabini oynar,
// state.json ve README'yi gunceller, issue'ya yazilacak yorumu COMMENT_FILE'a birakir.
// Bagimlilik yok: GitHub runner'indaki node ile calisir.
const fs = require('fs');
const path = require('path');

const REPO = process.env.GITHUB_REPOSITORY || 'erkangcmn/erkangcmn';
const STATE = path.join(__dirname, 'state.json');
const README = path.join(__dirname, '..', 'README.md');
const MISTAKE = 0.3; // botun bazen rastgele oynamasi: yenilmez bot sikici olur

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = b => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
};

function minimax(b, turn) {
  const w = winner(b);
  if (w === 'O') return { score: 1 };
  if (w === 'X') return { score: -1 };
  if (w === 'draw') return { score: 0 };
  let best = { score: turn === 'O' ? -2 : 2 };
  b.forEach((v, i) => {
    if (v) return;
    b[i] = turn;
    const { score } = minimax(b, turn === 'O' ? 'X' : 'O');
    b[i] = null;
    if (turn === 'O' ? score > best.score : score < best.score) best = { score, i };
  });
  return best;
}

function botMove(b) {
  const empty = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
  // Kazanan hamleyi asla kacirma; hata yalnizca savunmada olsun
  for (const i of empty) { const t = b.slice(); t[i] = 'O'; if (winner(t) === 'O') return i; }
  if (Math.random() < MISTAKE) return empty[Math.floor(Math.random() * empty.length)];
  return minimax(b.slice(), 'O').i;
}

const fresh = () => ({ board: Array(9).fill(null), stats: { human: 0, bot: 0, draw: 0 }, players: {}, history: [], last: '' });
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return fresh(); } };

function moveUrl(i) {
  const body = 'Hamleni yapmak için hiçbir şeyi değiştirmeden **Submit new issue**\'ya bas. ' +
    'Birkaç saniye içinde hamlemi yapar, README\'yi güncellerim. 🎮';
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`xox|${i + 1}`)}&body=${encodeURIComponent(body)}`;
}

function render(s) {
  const cell = (v, i) => v
    ? `<img src="game/img/${v.toLowerCase()}.svg" width="84" alt="${v}">`
    : `<a href="${moveUrl(i)}"><img src="game/img/empty.svg" width="84" alt="${i + 1}"></a>`;
  const rows = [0, 3, 6].map(r => `  <tr>${[0, 1, 2].map(c => `<td>${cell(s.board[r + c], r + c)}</td>`).join('')}</tr>`).join('\n');
  const top = Object.entries(s.players).filter(([, p]) => p.wins > 0).sort((a, b) => b[1].wins - a[1].wins || b[1].moves - a[1].moves).slice(0, 5);
  const hist = s.history.slice(0, 5).map(h => `<a href="https://github.com/${h.user}">@${h.user}</a> → ${h.cell}. kare`).join(' · ');
  return [
    '<div align="center">',
    '',
    '<h3>🎮 Benimle XOX oyna</h3>',
    '<p>Sen <b>X</b>\'sin, ben <b>O</b>. Boş bir kareye tıkla, açılan sayfada <b>Submit new issue</b>\'ya bas.<br>Birkaç saniye içinde hamlemi yapıp tahtayı güncellerim.</p>',
    '',
    '<table>',
    rows,
    '</table>',
    '',
    `<p>🏆 Ziyaretçiler <b>${s.stats.human}</b> &nbsp;·&nbsp; 🤖 Ben <b>${s.stats.bot}</b> &nbsp;·&nbsp; 🤝 Berabere <b>${s.stats.draw}</b></p>`,
    s.last ? `<p><i>${s.last}</i></p>` : '',
    hist ? `<p><sub>Son hamleler: ${hist}</sub></p>` : '',
    top.length ? `<p><sub>En iyiler: ${top.map(([u, p]) => `<a href="https://github.com/${u}">@${u}</a> (${p.wins} galibiyet)`).join(' · ')}</sub></p>` : '',
    '',
    '</div>',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

function writeReadme(s) {
  const md = fs.readFileSync(README, 'utf8');
  const out = md.replace(/<!-- XOX:START -->[\s\S]*<!-- XOX:END -->/, `<!-- XOX:START -->\n${render(s)}\n<!-- XOX:END -->`);
  fs.writeFileSync(README, out);
}

function play(title, user) {
  const m = /^xox\|([1-9])$/.exec(String(title).trim());
  if (!m) return 'Bu bir XOX hamlesi değil gibi görünüyor. README\'deki tahtadan bir kareye tıklayarak oynayabilirsin.';
  const i = Number(m[1]) - 1;
  const s = load();
  if (s.board[i]) return `${i + 1}. kare zaten dolu 😅 [Tahtaya dön](https://github.com/${REPO}) ve boş bir kare seç.`;

  const p = (s.players[user] = s.players[user] || { moves: 0, wins: 0 });
  p.moves++;
  s.board[i] = 'X';
  s.history.unshift({ user, cell: i + 1 });
  s.history = s.history.slice(0, 10);

  let msg;
  let w = winner(s.board);
  if (!w) {
    const j = botMove(s.board);
    s.board[j] = 'O';
    w = winner(s.board);
    msg = `Sen ${i + 1}. kareye X koydun, ben ${j + 1}. kareye O koydum.`;
  } else {
    msg = `Sen ${i + 1}. kareye X koydun.`;
  }

  if (w === 'X') { s.stats.human++; p.wins++; s.last = `Son oyunu @${user} kazandı 🎉 Yeni oyun başladı.`; msg += ' **Kazandın! 🎉** Tahtayı sıfırladım, yeni oyun başladı.'; }
  else if (w === 'O') { s.stats.bot++; s.last = `Son oyunu ben kazandım 🤖 (rakibim @${user}). Yeni oyun başladı.`; msg += ' **Bu sefer ben kazandım 🤖** Yeni oyun başladı, rövanş?'; }
  else if (w === 'draw') { s.stats.draw++; s.last = `Son oyun berabere bitti 🤝 Yeni oyun başladı.`; msg += ' **Berabere 🤝** Yeni oyun başladı.'; }
  else msg += ' Sıra sende!';
  if (w) s.board = Array(9).fill(null);

  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
  writeReadme(s);
  return `${msg}\n\n[Tahtaya dön ve oynamaya devam et →](https://github.com/${REPO})`;
}

if (require.main === module) {
  if (process.argv[2] === '--render') { writeReadme(load()); process.exit(0); }
  const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const reply = play(ev.issue.title, ev.issue.user.login);
  if (process.env.COMMENT_FILE) fs.writeFileSync(process.env.COMMENT_FILE, reply);
  console.log(reply);
}

module.exports = { play, winner, render };
