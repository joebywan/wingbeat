import { test, expect, reach, tapDuringHold } from './fixtures.js';
import { chipsOf, grade, optionsOf, vary, wayOf, withDecoy } from '../../src/code/items.js';
import { RUN_ENDS } from '../../src/cast/lines.js';
import { chipName } from '../../src/code/exercise.js';
import javascript from '../../src/code/courses/javascript.js';
import typescript from '../../src/code/courses/typescript.js';
import testing from '../../src/code/courses/testing.js';

const COURSES = [javascript, typescript, testing];
const itemsOf = (c) => c.units.flatMap((u) => u.lessons.flatMap((l) => l.items));
const continueButton = (page) => page.getByRole('button', { name: 'Continue', exact: true });
const wordsFor = (item) => (item.type === 'gap' ? item.fill : chipsOf(wayOf(item), item.chunks));
const chip = (page, word) => page.locator('.tiles').getByRole('button', { name: chipName(word), exact: true });

/** Answers an item right, the way a thumb would. */
async function solve(page, item) {
  if (item.type === 'build' || item.type === 'gap') {
    for (const w of wordsFor(item)) await chip(page, w).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  }
  if (item.type === 'predict') {
    const { answer } = optionsOf(item);
    const texts = await page.locator('.choices .choice').allTextContents(); // exact: "one two" is not "one\ntwo"
    await page.locator('.choices .choice').nth(texts.indexOf(answer)).click();
  }
  await expect(continueButton(page), item.id).toBeInViewport({ timeout: 15000 });
}

// The widest font a phone is likely to fall back to, as the Coding fit test has it, at both layouts' sizes.
for (const [width, height] of [[360, 582], [360, 640], [375, 812]]) test(`every code item fits a ${width}x${height} phone`, async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.addStyleTag({ content: 'body, button { font-family: "DejaVu Sans", Verdana, sans-serif; } :root { --mono: "DejaVu Sans Mono", monospace; }' });
  const all = COURSES.flatMap(itemsOf);
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Shipped items, and a fresh version of each: new names can run longer.
  const items = [...all, ...all.map((i) => vary(i, random)).filter(Boolean)];
  // What Fennel says over a missed run (one decoy swapped in), while the answer stays: it must fit his bubble too.
  const misses = items.map((item) => (item.type !== 'build' && item.type !== 'gap' ? [] : [...new Set([...withDecoy(item)].map(({ src }) => grade(item, src)).filter((r) => !r.right).map((r) => r.said ?? r.why))]));
  const bad = await page.evaluate(async ([items, misses]) => {
    const { mount } = await import('/src/code/exercise.js');
    const { chipsOf, wayOf } = await import('/src/code/items.js');
    const app = document.getElementById('app');
    const out = [];
    for (const [n, item] of items.entries()) { // the bar as tall as a session's (its close button and meter): 61px
      app.innerHTML = `<header class="bar" style="height:61px"></header><main class="play"><p class="topic">Topic</p>
        <div class="coach"><button class="who"></button><p class="bubble"></p></div><div class="stage"></div></main>`;
      const bubble = app.querySelector('.bubble');
      const stop = mount(app.querySelector('.stage'), item, { say(t) { bubble.textContent = t; }, done() {} });
      const note = (why) => out.push(`${item.id}: ${why}`);
      const tiles = app.querySelector('.tiles');
      if (tiles) {
        const rect = tiles.getBoundingClientRect();
        if (rect.bottom > innerHeight + 1) note('the tray runs off the screen');
        if (tiles.querySelector('.run').getBoundingClientRect().bottom > innerHeight + 1) note('Run is off the screen');
        for (const c of tiles.querySelectorAll('[data-chip]')) if (c.getBoundingClientRect().height < 40 || c.scrollWidth > c.clientWidth + 1) note(`chip ${c.textContent} is cramped`);
        // Asked, a box that scrolls ends on a whole row (boxTo in src/fit.js): never across a chip, a gap or a line of the code.
        const box = app.querySelector('.program'), end = box.getBoundingClientRect().top + box.clientTop + box.clientHeight;
        const across = [...box.querySelectorAll('.answer :is(button, .hole, .fixed-word)')].filter((e) => e.getBoundingClientRect().top < end - 1 && e.getBoundingClientRect().bottom > end + 1);
        if (across.length) note(`the answer's box ends across a row: ${across.map((e) => `${e.textContent || 'a gap'} (${Math.round(end - e.getBoundingClientRect().top)} of ${Math.round(e.getBoundingClientRect().height)}px)`).join(', ')}`);
        // The gap to fill is what the learner works on: whole in sight in its box as the item arrives, and the next one after each fill.
        const inSight = (when) => {
          const gap = box.querySelector('.hole');
          if (!gap) return;
          const top = box.getBoundingClientRect().top + box.clientTop, r = gap.getBoundingClientRect();
          if (r.top < top - 1 || r.bottom > top + box.clientHeight + 1) note(`${when}, the gap to fill is out of sight: ${Math.round(r.top - top)} to ${Math.round(r.bottom - top)}px in a box ${box.clientHeight}px high`);
        };
        inSight('asked');
        const words = item.type === 'gap' ? item.fill : chipsOf(wayOf(item), item.chunks);
        for (const [i, w] of words.entries()) {
          [...tiles.querySelectorAll('[data-chip]')].find((c) => c.textContent === w).click();
          inSight(`after fill ${i + 1}`);
        }
        const prog = app.querySelector('.program');
        const roof = tiles.getBoundingClientRect().top;
        const r = prog.getBoundingClientRect();
        if (r.bottom > roof + 1) note(`the answer runs under the tray: ${Math.round(r.bottom)} over ${Math.round(roof)}`);
        if (r.height < 44) note(`only ${Math.round(r.height)}px for the answer`);
        if (prog.scrollWidth > prog.clientWidth + 1) note('the answer scrolls sideways');
        for (const b of prog.querySelectorAll('button:not(.slot)')) if (b.getBoundingClientRect().height < 40) note(`a placed word is ${Math.round(b.getBoundingClientRect().height)}px high, under 40`); // as tall as anything else tapped
      }
      const given = app.querySelector('.code-given');
      if (given && tiles && given.getBoundingClientRect().bottom > tiles.getBoundingClientRect().top) note('the given code runs under the tray');
      const choices = app.querySelector('.quiz .choices');
      if (choices?.children.length) {
        const c = choices.getBoundingClientRect();
        const card = app.querySelector('.quiz .card');
        if (c.bottom > innerHeight + 1) note('the answers run off the screen');
        if (card && card.getBoundingClientRect().height && card.getBoundingClientRect().bottom > c.top + 1) note(`the code runs under the answers: ${Math.round(card.getBoundingClientRect().bottom)} over ${Math.round(c.top)}`);
        for (const b of choices.children) if (b.getBoundingClientRect().height < 44) note('an answer is under 44px');
      }
      const reserved = parseFloat(getComputedStyle(bubble).minHeight);
      if (item.prompt && bubble.offsetHeight > reserved + 1) note(`the prompt outgrows the bubble: ${bubble.offsetHeight} over ${reserved}`);
      for (const line of misses[n]) {
        bubble.textContent = line;
        if (bubble.offsetHeight > reserved + 1) note(`a miss outgrows the bubble: ${bubble.offsetHeight} over ${reserved}: ${line}`);
      }
      if (document.documentElement.scrollWidth > innerWidth) note(`sideways ${document.documentElement.scrollWidth - innerWidth}`);
      // Code to read never runs off the side of its box (Test writing's first card once did): a long line wraps.
      for (const box of app.querySelectorAll('.quiz .card .glyph, .code-given')) if (box.scrollWidth > box.clientWidth + 1) note(`code runs ${box.scrollWidth - box.clientWidth}px off the side of its box`);
      stop?.();
    }
    return out;
  }, [items, misses]);
  expect(bad).toEqual([]);
});

test('at 412x786, what a Run printed shows next to what it should print, clear of the verdict', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 412, height: 786 });
  const all = typescript.units.flatMap((u) => u.lessons);
  const lesson = all.find((l) => l.id === 'tsi-2');
  const unit = typescript.units.find((u) => u.lessons.includes(lesson));
  await page.goto('/');
  await page.evaluate(([start, done]) => {
    localStorage.setItem('wingbeat.course', 'typescript');
    localStorage.setItem('wingbeat.progress', JSON.stringify({ ...JSON.parse(localStorage.getItem('wingbeat.progress') || '{}'), version: 3, picked: [], done, cards: {}, habits: {}, log: [], start: { typescript: start } }));
  }, [unit.title, Object.fromEntries(unit.lessons.slice(0, unit.lessons.indexOf(lesson)).map((l) => [`typescript:${l.id}`, true]))]);
  await page.reload();
  await page.getByRole('button', { name: `Continue · ${lesson.title}` }).click();
  const box = (sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; });
  let printed = 0;
  for (const item of lesson.items) {
    await solve(page, item);
    if (item.goal === 'print') {
      printed++;
      const [want, got, foot] = [await box('.code-goal code'), await box('.code-out'), await box('.foot')];
      expect(got.bottom, `${item.id}: the verdict covers what it printed`).toBeLessThanOrEqual(foot.top);
      expect(got.top - want.bottom, `${item.id}: what it printed sits right under what it should print`).toBeLessThan(10);
      expect(Math.abs(got.left - want.left), `${item.id}: the two line up`).toBeLessThan(1);
      await expect(page.locator('.code-out')).toHaveText(await page.locator('.code-goal code').textContent());
    }
    await continueButton(page).click();
  }
  expect(printed).toBeGreaterThan(0);
});

test('the Test writing tray never shows a chip cut in half above Run', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 786 });
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --mono: "DejaVu Sans Mono", monospace; }' });
  const item = itemsOf(testing).find((i) => i.id === 'tb-2-4');
  const bad = await page.evaluate(async (item) => {
    const { mount } = await import('/src/code/exercise.js');
    const app = document.getElementById('app');
    const out = [];
    let seed = 7;
    const random = Math.random;
    for (let n = 0; n < 12; n++) { // the tray is shuffled: some orders take more rows than others
      Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      app.innerHTML = `<header class="bar" style="height:44px"></header><main class="play"><p class="topic">Topic</p>
        <div class="coach"><button class="who"></button><p class="bubble"></p></div><div class="stage"></div></main>`;
      const stop = mount(app.querySelector('.stage'), item, { say(t) { app.querySelector('.bubble').textContent = t; }, done() {} });
      Math.random = random;
      const chips = app.querySelector('.code-tray .chips').getBoundingClientRect();
      const run = app.querySelector('.code-tray .run').getBoundingClientRect();
      for (const c of app.querySelectorAll('.code-tray [data-chip]')) {
        const r = c.getBoundingClientRect();
        if (r.top < chips.bottom - 1 && r.bottom > chips.bottom + 1) out.push(`order ${n}: ${c.textContent} is cut in half`);
        if (r.bottom > run.top && r.top < chips.bottom) out.push(`order ${n}: ${c.textContent} runs under Run`);
      }
      stop?.();
    }
    return out;
  }, item);
  expect(bad).toEqual([]);
});

test('a box that scrolls marks more above and below, and drops the marks as it scrolls to its ends', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 533 });
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --mono: "DejaVu Sans Mono", monospace; }' });
  const item = itemsOf(testing).find((i) => i.id === 'tb-2-7');
  await page.evaluate(async (item) => {
    const { mount } = await import('/src/code/exercise.js');
    const app = document.getElementById('app');
    app.innerHTML = `<header class="bar" style="height:44px"></header><main class="play"><p class="topic">Topic</p>
      <div class="coach"><button class="who"></button><p class="bubble"></p></div><div class="stage"></div></main>`;
    mount(app.querySelector('.stage'), item, { say(t) { app.querySelector('.bubble').textContent = t; }, done() {} });
  }, item);
  const given = page.locator('.code-given');
  const marks = () => given.evaluate((e) => [e.classList.contains('more-above'), e.classList.contains('more-below'), getComputedStyle(e, '::after').content !== 'none', getComputedStyle(e, '::before').content !== 'none']);
  expect(await marks()).toEqual([false, true, true, false]); // the code under test is taller than its share here
  await given.evaluate((e) => { e.scrollTop = 20; });
  await expect.poll(marks).toEqual([true, true, true, true]);
  await given.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect.poll(marks).toEqual([true, false, false, true]);
  // The gradient stays on the box's edge, not on the content it scrolled past.
  const [edge, box] = await given.evaluate((e) => [parseFloat(getComputedStyle(e, '::before').top), e.scrollTop]);
  expect(edge).toBe(box);
  // A box that grows to hold all it has drops the marks.
  await given.evaluate((e) => { e.style.maxHeight = 'none'; });
  await expect.poll(marks).toEqual([false, false, false, false]);
});

// A code card (teach, predict, check) through the quiz, as the runner shows it: asked, its card ends above the answers; answered,
// above the verdict, which covers the answers it replaces even with its shortest headline (none of a check card's rows shows above it); code that can't all show scrolls in its own box down to the last line. Chrome on a phone measures vh with
// its address bar hidden, but lays the page out under it while it shows: a page 533px high has vh of 589px. Playwright has no
// address bar, so `bar` makes one: the page is that much taller (vh as the phone's) and starts that much lower (room as the phone's).
for (const [width, height, bar] of [[412, 533, 0], [412, 533, 56], [412, 786, 56]]) test(`every code card fits a ${width}x${height} page${bar ? ' under an address bar' : ''}, asked and answered`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: height + bar });
  await page.goto('/');
  await page.addStyleTag({ content: `body, button { font-family: "DejaVu Sans", Verdana, sans-serif; } :root { --mono: "DejaVu Sans Mono", monospace; } body { padding-top: ${bar}px; }` });
  const cards = COURSES.flatMap(itemsOf).filter((i) => !i.level && (i.type === 'teach' || i.type === 'predict'));
  const bad = await page.evaluate(async (items) => {
    const { mount } = await import('/src/code/exercise.js');
    const { optionsOf } = await import('/src/code/items.js');
    const { CODE_LINES } = await import('/src/cast/lines.js');
    const { giveWay } = await import('/src/fit.js');
    const app = document.getElementById('app');
    const out = [];
    for (const item of items) {
      app.innerHTML = `<header class="bar" style="height:44px"></header><main class="play"><p class="topic">Topic</p>
        <div class="coach"><button class="who"></button><p class="bubble"></p></div><div class="stage"></div></main>
        <footer class="foot"><div class="verdict"><strong></strong><p></p></div><button class="next">Continue</button></footer>`;
      const bubble = app.querySelector('.bubble'), foot = app.querySelector('.foot');
      const lines = Object.values(CODE_LINES).flat().filter((l) => typeof l === 'string');
      const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
      let said = '';
      const done = (right, why = '') => { foot.className = `foot show ${right === null ? 'plain' : right ? 'right' : 'wrong'}`; foot.querySelector('strong').textContent = longest; foot.querySelector('p').textContent = said = why; giveWay(foot); };
      const stop = mount(app.querySelector('.stage'), item, { say(t) { bubble.textContent = t; }, done, coach: { lines: CODE_LINES } });
      const note = (why) => out.push(`${item.id}: ${why}`);
      const card = app.querySelector('.quiz .card');
      const code = card?.querySelector('.glyph');
      const choices = app.querySelector('.quiz .choices');
      if (card?.getClientRects().length) {
        if (choices?.children.length) {
          const tray = choices.getBoundingClientRect();
          if (card.getBoundingClientRect().bottom > tray.top + 1) note(`asked, the card ends ${Math.round(card.getBoundingClientRect().bottom - tray.top)}px under the answers`);
          if (tray.top < bubble.getBoundingClientRect().bottom) note('the answers reach the coach');
          const { answer } = optionsOf(item);
          [...choices.children].find((b) => b.textContent === answer)?.click();
        }
        const roof = innerHeight - foot.offsetHeight;
        if (card.getBoundingClientRect().bottom > roof + 1) note(`answered, the verdict covers ${Math.round(card.getBoundingClientRect().bottom - roof)}px of the card`);
        if (code) {
          code.scrollTop = code.scrollHeight;
          const last = code.getBoundingClientRect();
          if (code.scrollTop + code.clientHeight < code.scrollHeight - 1) note('the last line of the code cannot be scrolled to');
          if (last.bottom > Math.min(roof, innerHeight) + 1) note('the last line of the code is under the verdict');
        }
        if (choices?.children.length) {
          foot.querySelector('strong').textContent = lines.reduce((a, b) => (b.length < a.length ? b : a));
          foot.querySelector('p').textContent = said;
          giveWay(foot);
          const shows = foot.getBoundingClientRect().top - choices.getBoundingClientRect().top;
          if (shows > 0.5) note(`answered with a short verdict, ${Math.round(shows)}px of the answers show above it`);
        }
      }
      stop?.();
    }
    return out;
  }, cards);
  expect(bad).toEqual([]);
});

for (const [course, id] of [[javascript, 'jsv-1'], [javascript, 'jsl-1'], [javascript, 'jsf-3'], [javascript, 'jse-2'], [typescript, 'tsu-2'], [testing, 'tb-1']]) {
  test(`${course.title}: ${id} plays through as a real session`, async ({ page }) => {
    test.setTimeout(120000);
    const all = course.units.flatMap((u) => u.lessons);
    const lesson = all.find((l) => l.id === id);
    const unit = course.units.find((u) => u.lessons.includes(lesson));
    await page.goto('/');
    await page.evaluate(([c, start, done]) => {
      localStorage.setItem('wingbeat.course', c);
      localStorage.setItem('wingbeat.progress', JSON.stringify({ ...JSON.parse(localStorage.getItem('wingbeat.progress') || '{}'), version: 3, picked: [], done, cards: {}, habits: {}, log: [], start: { [c]: start } }));
    }, [course.id, unit.title, Object.fromEntries(unit.lessons.slice(0, unit.lessons.indexOf(lesson)).map((l) => [`${course.id}:${l.id}`, true]))]);
    await page.reload();
    await page.getByRole('button', { name: `Continue · ${lesson.title}` }).click();
    for (const item of lesson.items) {
      await solve(page, item);
      await expect(page.locator('.foot.wrong'), item.id).toHaveCount(0);
      await continueButton(page).click();
    }
    await expect(page.locator('.summary')).toBeVisible();
    const marked = lesson.items.filter((i) => i.type !== 'teach').length;
    await expect(page.getByText(`${marked} of ${marked} right first try`)).toBeVisible();
  });
}

// A missed run is shown before it is replaced, as in Coding (hold() in src/feel.js): the learner's own code stays, with
// what it printed and Fennel saying what happened (here which faulty version got through), and nothing on the screen moves;
// then the way that works takes its place, the reason first in the verdict.
const MISSES = [
  { course: 'javascript', lesson: 'jsl-1', id: 'jsl-1-3', decoy: '3', printed: 'hop\nhop\nhop' },
  { course: 'testing', lesson: 'tb-1', id: 'tb-1-3', decoy: 'expect(add(2, 2)).toBe(4)' },
];
/** Plays `m`'s item with its decoy in the gap and presses Run. Returns what Fennel says over the miss. */
const missed = (m) => async (page) => {
  const item = await reach(page, m.course, m.lesson, m.id);
  await chip(page, m.decoy).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const r = grade(item, item.code.replace('___', m.decoy));
  expect(r.right).toBe(false);
  return r.said ?? r.why;
};
for (const m of MISSES) {
  test(`${m.course}: a missed run keeps the learner's own code and what it did on screen, then the way that works replaces it, and nothing moves`, async ({ page }) => {
    const item = await reach(page, m.course, m.lesson, m.id);
    const { why, said = why } = grade(item, item.code.replace('___', m.decoy));
    await chip(page, m.decoy).click();
    const tops = () => page.evaluate(() => ['.bubble', '.code-goal', '.code-given', '.code-program', '.code-tray'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? null));
    const asked = await tops();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    // The hold: their own code, what it printed, Fennel's line; no way that works and no verdict yet.
    await expect(page.locator('#said')).toHaveText(said);
    await expect(page.locator('.code-program')).toContainText(m.decoy);
    if (m.printed) await expect(page.locator('.code-out')).toHaveText(m.printed);
    await expect(page.locator('.program.shown')).toHaveCount(0);
    await expect(page.locator('.foot.show')).toHaveCount(0);
    expect(await tops(), 'the hold moves nothing').toEqual(asked);
    // Then the way that works takes its place, the reason first in the verdict.
    await expect(page.locator('.program.shown')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.code-program')).not.toContainText(m.decoy);
    await expect(page.locator('#said')).toHaveText(RUN_ENDS.way);
    await expect(page.locator('.foot.wrong')).toBeVisible();
    expect((await page.locator('.foot.wrong p').textContent()).startsWith(`${why} `), 'the reason comes first in the verdict').toBe(true);
    if (m.printed) await expect(page.locator('.code-out')).toHaveText(m.printed);
    expect((await tops()).slice(0, 4), 'the way replacing it moves nothing above the verdict').toEqual(asked.slice(0, 4));
  });
}
// On a short phone (412x533) Test writing's answer box ended 7px into the row being filled, asked and while a missed run was
// held, that row under the box's fade. The tray draws a gap of its own, so the box gives up its 8px gap above the tray and
// ends on that row (boxTo in src/fit.js).
test('at 412x533, a Test writing answer box ends on the whole row being filled, asked and held', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 533 });
  const m = MISSES[1];
  const item = await reach(page, m.course, m.lesson, m.id);
  const row = (sel) => page.evaluate((sel) => {
    const box = document.querySelector('.code-program');
    return { end: box.getBoundingClientRect().top + box.clientHeight, bottom: box.querySelector(sel).getBoundingClientRect().bottom, tray: document.querySelector('.code-tray').getBoundingClientRect().top };
  }, sel);
  const asked = await row('.hole');
  expect(asked.bottom, 'asked, the gap to fill shows whole').toBeLessThanOrEqual(asked.end + 0.5);
  expect(asked.end, 'the box ends above the tray').toBeLessThanOrEqual(asked.tray);
  await chip(page, m.decoy).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('#said')).toHaveText(grade(item, item.code.replace('___', m.decoy)).said); // the hold
  const held = await row('[data-take]');
  expect(held.bottom, 'held, the chip placed shows whole').toBeLessThanOrEqual(held.end + 0.5);
});
test("a click during a code course's missed run's hold goes straight to the way that works, and does not press the Continue that comes under it", ({ page }) => tapDuringHold(page, false, missed(MISSES[0])));
test.describe('with a finger', () => {
  test.use({ hasTouch: true, isMobile: true });
  test("a touch during a code course's missed run's hold does the same", ({ page }) => tapDuringHold(page, true, missed(MISSES[1])));
});
