// How to play (PIO6): the card players learn the game from, opened from a ? in the top-right corner of every
// screen of the online page and the hotseat. A classic script after rules.js, read by both pages. The words
// are Alex's, approved word for word in the vault (PIO6 04 The Rules Text, PI3 06 for Jettison): change none here
// without them, and a RULES variant (winAt, refill, pickTimer, nextTimer, jettisonTimer) means changing the words
// that name its number. The card follows the crash rule in play: each page calls HowToPlay.rule() when it changes.
(() => {
  const chip = mark => { const t = Rules.RULES.treasure.find(t => t.mark === mark); return `<span class="t" style="background:${t.ink}">${mark}</span>`; };
  const chips = marks => marks.split(' ').map(chip).join(' ');

  // One card per crash rule (PI3 06 The How to Play Words for Jettison), each naming its rule under the goal
  const TEXT = {
    jettison: `<p><b>Be the first to collect 5 treasures of one colour.</b><br>Crash rule: <b>Jettison</b></p>
    <h3>A round</h3>
    <ol>
      <li><b>Pick.</b> Everyone secretly picks an island and taps <b>Lock in</b>.</li>
      <li><b>Reveal.</b> All the picks show at once.</li>
      <li><b>Each island:</b><ul>
        <li><b>Raid</b>: one player alone takes the whole pile.</li>
        <li><b>Crash</b>: two or more players there means nobody takes anything.</li>
        <li><b>Nobody came</b>: the pile stays.</li></ul></li>
      <li><b>Win?</b> Anyone with 5 of one colour wins.</li>
      <li><b>Jettison.</b> Everyone who crashed secretly puts 1 treasure from their haul onto any island. No treasure, no jettison.</li>
      <li><b>Refill.</b> Every island that didn't crash and got no jettison gets 1 new treasure from the bag.</li>
    </ol>
    <h3>Example</h3>
    <p>Island A: Ana alone. <b>Raid</b>, Ana takes ${chips('R R G')}.<br>
      Island B: Ben and Cy. <b>Crash</b>, ${chips('E S')} stays.<br>
      Island C: nobody. The pile stays.<br>
      <b>Jettison:</b> Ben puts ${chips('S')} onto B, Cy puts ${chips('G')} onto C. Only A gets a new treasure.</p>
    <h3>Good to know</h3>
    <ul>
      <li>Every pile, every player's haul and every jettison is public. The bag is hidden, and you only see last round's picks and jettisons.</li>
      <li>A tie at 5 goes to most of that colour, then most colours, then most treasure, else it's shared.</li>
      <li>If the bag can't refill every island that's due one, the game ends: most of one colour wins.</li>
    </ul>`,
    freeze: `<p><b>Be the first to collect 5 treasures of one colour.</b><br>Crash rule: <b>Freeze</b></p>
    <h3>A round</h3>
    <ol>
      <li><b>Pick.</b> Everyone secretly picks an island and taps <b>Lock in</b>.</li>
      <li><b>Reveal.</b> All the picks show at once.</li>
      <li><b>Each island:</b><ul>
        <li><b>Raid</b>: one player alone takes the whole pile.</li>
        <li><b>Crash</b>: two or more players there means nobody takes anything, and the island freezes.</li>
        <li><b>Nobody came</b>: the pile stays.</li></ul></li>
      <li><b>Win?</b> Anyone with 5 of one colour wins.</li>
      <li><b>Refill.</b> Every island that didn't crash gets 1 new treasure from the bag.</li>
    </ol>
    <h3>Example</h3>
    <p>Island A: Ana alone. <b>Raid</b>, Ana takes ${chips('R R G')}.<br>
      Island B: Ben and Cy. <b>Crash</b>, ${chips('E S')} stays, frozen.<br>
      Island C: nobody. 1 new treasure.</p>
    <h3>Good to know</h3>
    <ul>
      <li>Every pile and every player's haul is public. The bag is hidden, and you only see last round's picks.</li>
      <li>A tie at 5 goes to most of that colour, then most colours, then most treasure, else it's shared.</li>
      <li>If the bag can't refill every island, the game ends: most of one colour wins.</li>
    </ul>`,
  };
  const ONLINE = {
    jettison: `<h3>Playing online</h3>
    <ul>
      <li>You have <b>1 minute</b> to pick, shown by the bar at the top. A pick is final.</li>
      <li>Too slow? You're <b>skipped</b>: no island this round.</li>
      <li>Crashed? You have <b>30 seconds</b> to jettison. Too slow, and a bot jettisons for you.</li>
      <li>Phone locked or app switched? A bot plays for you until you're back, and you keep your haul.</li>
      <li>The next round starts by itself 5 seconds after the reveal, or after the jettisons.</li>
    </ul>`,
    freeze: `<h3>Playing online</h3>
    <ul>
      <li>You have <b>1 minute</b> to pick, shown by the bar at the top. A pick is final.</li>
      <li>Too slow? You're <b>skipped</b>: no island this round.</li>
      <li>Phone locked or app switched? A bot plays for you until you're back, and you keep your haul.</li>
      <li>The next round starts by itself 5 seconds after the reveal.</li>
    </ul>`,
  };
  const PASS = `<p><b>Pass and play:</b> no timers. Take as long as you like, and tap <b>Next round</b> when everyone's ready.</p>`;

  const STYLE = `
    #howto-open { float: right; width: 40px; height: 40px; padding: 0; margin: 2px 0 0 8px; border-radius: 50%; font-size: 22px; font-weight: bold; }
    #howto { width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 48px); box-sizing: border-box; padding: 0;
      border: 2px solid #c9b78f; border-radius: 12px; background: #fff; color: #222; }
    #howto::backdrop { background: #0006; }
    #howto header { position: sticky; top: 0; background: #fff; padding: 12px 16px 4px; border-bottom: 1px solid #eee; }
    #howto header div { display: flex; align-items: center; justify-content: space-between; }
    #howto h2 { margin: 0; } #howto h3 { margin: 14px 0 4px; }
    #howto header button { margin: 0; padding: 4px 12px; font-size: 20px; background: none; color: #1d5c7a; }
    #howto-status { margin: 4px 0 0; font-weight: bold; color: #1d5c7a; }
    #howto-status.crash { color: #b42318; }
    #howto section { padding: 0 16px 12px; } #howto ol, #howto ul { padding-left: 22px; margin: 4px 0; } #howto li { margin: 2px 0; }`;

  let card, status, body, online, alarm = false, shown = 'jettison';

  // Adds the ? and the card to the page. online picks the last block; onSetup opens the card by itself once, on a
  // first visit to the setup screen, never over a game. The card starts on Jettison, the default.
  function mount(onlinePage, onSetup) {
    online = onlinePage;
    document.head.insertAdjacentHTML('beforeend', `<style>${STYLE}</style>`);
    document.body.insertAdjacentHTML('afterbegin', `<button type="button" id="howto-open" title="How to play" aria-label="How to play">?</button>`);
    // Directly under <body>, outside #app, so a redraw never touches it
    document.body.insertAdjacentHTML('beforeend', `<dialog id="howto" aria-labelledby="howto-title">
      <header><div><h2 id="howto-title">How to play</h2><button type="button" aria-label="Close">✕</button></div><p id="howto-status" hidden></p></header>
      <section></section></dialog>`);
    card = document.getElementById('howto'); status = document.getElementById('howto-status'); body = card.querySelector('section');
    rule(shown);
    // The tap pushes a history entry, so Back closes the card instead of leaving the page (PIO6 02)
    document.getElementById('howto-open').onclick = () => { try { history.pushState({ howToPlay: true }, ''); } catch {} open(); };
    card.querySelector('header button').onclick = () => card.close();
    card.onclick = e => e.target === card && card.close(); // the backdrop: only it is the dialog itself
    card.onclose = () => { alarm = false; draw(''); if (history.state?.howToPlay) history.back(); }; // ✕, Escape or backdrop
    addEventListener('popstate', () => card.open && card.close()); // Back
    let seen = null; try { seen = localStorage.getItem('seenHowToPlay'); localStorage.setItem('seenHowToPlay', '1'); } catch {}
    if (onSetup && !seen) open();
  }
  // Shows the card for a crash rule, 'jettison' or 'freeze'. Cheap to call on every redraw: it redraws only on a change.
  function rule(r) {
    shown = r === 'freeze' ? 'freeze' : 'jettison';
    if (body && body.dataset.rule !== shown) body.innerHTML = TEXT[shown] + (online ? ONLINE[shown] : PASS), body.dataset.rule = shown;
  }
  const open = () => { if (!card.open) card.showModal(), card.scrollTop = 0; }; // always from the top
  const draw = (text, red = false) => { status.textContent = text; status.hidden = !text; status.classList.toggle('crash', red); };

  globalThis.HowToPlay = {
    mount,
    rule,
    status: text => alarm || draw(text), // the online page's seconds left to pick, '' for none
    revealed: () => { if (card?.open) alarm = true, draw('The reveal is in: close to see it', true); }, // stays red until closed
  };
})();
