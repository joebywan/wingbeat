import { reducedMotion } from './cast/kit.js';
import { LINES } from './cast/lines.js';

/**
 * Fitting a screen on a phone: a program for Coding (src/coding/exercise.js) and the code courses (src/code/exercise.js),
 * a card for the quiz items (src/quiz/exercise.js). Fit first (the coach, the gaps, a map or pictures give room), then
 * it scrolls in its own box, never the page, and once answered the verdict covers neither its end nor the part that matters.
 */

/**
 * A phone on its side. Wingbeat is made for an upright phone, so a lesson or routine asks to be turned back (app.js sets
 * `data-sideways` on <html>, styles.css shows `.upright` over `main.play`) and a timed routine holds where it is. Read
 * from the screen, never the page: the keyboard shrinks the page (`interactive-widget=resizes-content`, the app's
 * adjustResize) to wider than tall on a short phone, and that is not a phone on its side. So: a touch screen
 * (`navigator.maxTouchPoints`, never the pointer media queries: Firefox calls a touch screen that also takes a stylus
 * "fine", any-pointer too), turned to landscape and away from the way the device is held naturally (an angle of 90 or
 * 270), whose short side is a phone's (under 500 CSS px; a tablet's is 600 or more). Where the browser has no
 * `screen.orientation` it is never sideways. `matches`, and a 'change' event, like a MediaQueryList.
 */
export const SIDEWAYS = (() => {
  const turned = globalThis.screen?.orientation;
  if (!turned) return null;
  // A landscape type at an angle of 0 is a desktop browser emulating touch (it reports one for any page) or a tablet held
  // wide, never a phone turned. An iPhone's screen.width and screen.height never turn, so the angle is what says it.
  const now = () => navigator.maxTouchPoints > 0 && turned.type.startsWith('landscape') && turned.angle % 180 !== 0 && Math.min(screen.width, screen.height) < 500;
  const side = new EventTarget();
  let was = now();
  const check = () => { if (now() !== was) { was = !was; side.dispatchEvent(new Event('change')); } };
  turned.addEventListener('change', check);
  addEventListener('resize', check); // some browsers turn the page before they say so
  return Object.defineProperty(side, 'matches', { get: now });
})();

/**
 * How tall the runner's verdict banner will be with `words` in it (null: a teach card's, Continue alone) under the
 * longest verdict the coach's `lines` could give, by measuring a hidden copy, so a tall program can be fitted above
 * it before it comes. Never more than half the screen: past that its words scroll in their own box (styles.css,
 * `.foot`), so whatever fits itself above it gets the other half. 0 with no banner on the page.
 */
/** The longest headline the runner's verdict can show of `kinds` with a coach's `lines` (Rosa's, `LINES`, for a coach with none of their own), for any item: `correct:move` and the like count too. */
export const longestVerdict = (lines = LINES, kinds = ['correct', 'run3', 'run5', 'wrong']) => kinds.flatMap((k) => Object.entries(lines).filter(([key]) => key.split(':')[0] === k).flatMap(([, v]) => v)).reduce((a, b) => (b.length > a.length ? b : a), 'x');

export function verdictHeight(words, lines) {
  const foot = document.querySelector('.foot');
  if (!foot) return 0;
  const copy = foot.cloneNode(true);
  copy.className = `foot show${words === null ? ' plain' : ''}`;
  copy.style.visibility = 'hidden';
  copy.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  copy.querySelector('strong').textContent = longestVerdict(lines);
  copy.querySelector('p').textContent = words ?? '';
  foot.after(copy);
  giveWay(copy, false);
  const height = copy.offsetHeight;
  copy.remove();
  return height;
}

/**
 * The verdict banner `foot` is never more than half the screen (styles.css, `.foot`). Past that it gives way: its
 * headline to two lines (`.clamp`, read whole by a screen reader), then its words scroll in their own box (`scrollBox`,
 * unless only measuring), Continue staying in view. Call it whenever its words change.
 */
export function giveWay(foot, scrolls = true) {
  const box = foot.querySelector('.verdict');
  // It covers the answers it replaces: never shorter than their tray (a code check card's rows), up to half the screen.
  const tray = Math.max(0, ...[...document.querySelectorAll('.play .choices')].filter((t) => t.children.length && getComputedStyle(t).position === 'fixed').map((t) => t.offsetHeight));
  foot.style.minHeight = tray ? `${Math.min(tray, Math.floor(innerHeight / 2))}px` : '';
  // Measured to the fraction of a pixel: scrollHeight and clientHeight are whole numbers, so 109.05px of words in a 107.7px
  // box read 109 against 108, and their last 1.35px went past the box unscrolled (Firefox for Android, font size 2.0).
  const over = () => box.lastElementChild.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom + 0.1;
  foot.classList.remove('clamp');
  box.classList.remove('scrolls');
  box.scrollTop = 0;
  if (over()) foot.classList.add('clamp');
  if (over() && scrolls) scrollBox(box);
}

/**
 * A screen giving way, in order: each of `steps` ([give, undo]) is taken while `over()` (px of what matters past what
 * covers it) is above 0. If all of them together can't bring it to 0, none is kept and the screen is as it was (home
 * then scrolls to it). A screen that fits is left as it is. Returns whether it fits.
 */
export function giveRoom(over, steps) {
  const taken = [];
  for (const [give, undo] of steps) {
    if (over() <= 0) return true;
    give();
    taken.unshift(undo);
  }
  if (over() <= 0) return true;
  for (const undo of taken) undo();
  return false;
}

/**
 * Of `lines`, those the coach's `bubble` can say as it stands: no taller than it is now, so nothing under it ever moves.
 * Measured in a hidden copy (same classes, same width). With no bubble on the page, all of them.
 */
export function fitsBubble(bubble, lines) {
  if (!bubble) return lines;
  const copy = bubble.cloneNode(false);
  copy.removeAttribute('id');
  copy.removeAttribute('aria-live');
  copy.style.cssText += `;position:absolute;visibility:hidden;width:${bubble.offsetWidth}px`;
  bubble.after(copy);
  const fits = lines.filter((t) => { copy.textContent = t; return copy.offsetHeight <= bubble.offsetHeight; });
  copy.remove();
  return fits;
}

/** Scrolls `box` (never the page) so `el` in it shows: smoothly, unless motion is reduced. */
export function keepInView(box, el) {
  if (!el || box.scrollHeight <= box.clientHeight) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const by = r.top < b.top ? r.top - b.top - 6 : r.bottom > b.bottom ? Math.min(r.bottom - b.bottom + 6, r.top - b.top - 6) : 0;
  if (by) box.scrollBy({ top: by, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Makes `el` a box that scrolls in itself (`.scrolls`) and shows when there is more of it above or below: it is
 * marked `more-above` / `more-below`, kept right as it scrolls, changes size or is redrawn, and styles.css draws a
 * plain gradient over that edge in the box's `--fade` colour. Plain DOM and CSS, so every browser shows it; not a
 * mask, which crashed the emulator's software renderer. Returns `el`.
 */
export function scrollBox(el) {
  el.classList.add('scrolls');
  if (el.edges) return el;
  el.edges = true;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; // the gradients sit on its edges
  const mark = () => {
    el.style.setProperty('--scrolled', `${el.scrollTop}px`);
    el.classList.toggle('more-above', el.scrollTop > 1);
    el.classList.toggle('more-below', el.scrollHeight - el.clientHeight - el.scrollTop > 1);
  };
  el.addEventListener('scroll', mark, { passive: true });
  new ResizeObserver(mark).observe(el);
  new MutationObserver(mark).observe(el, { childList: true, subtree: true, characterData: true });
  mark();
  return el;
}

/** Where `el`'s top is on the page (as if scrolled to the top, where a lesson is seen). */
export const topOf = (el) => el.getBoundingClientRect().top + scrollY;

const LINE = 44; // the least of a program that shows: a row of blocks, two lines of code

/** Where the next tap fills in what is being built (src/builder.js, Coding's holes): a box above the tray keeps it in. */
const NEXT = '.here, .fill-next, .hole';

/**
 * Past `bottom` (a y on the page) `el` scrolls in its own box (`scrollBox`), if it is taller than that, 8px above it; a box
 * only ever shrinks. With `always`, the box ends at `bottom` whatever `el` holds now or was before (an answer that grows).
 * Over the `tray` (whose own padding is a gap too) a box ends on a whole row of what it holds (`wholeRows`): the 8px go
 * first, for a row or all of it, else it ends on the last whole row, if that still holds a LINE and all of where the next tap
 * fills, when that shows (a gap to fill cut by the box stays cut rather than go).
 */
export function boxTo(el, bottom, always = false, tray = false) {
  let room = Math.floor(bottom - topOf(el) - 8);
  let all = el.scrollHeight;
  if (tray) {
    all = wholeRows(el, Infinity); // what it holds, without the invisible thumb targets past its last row
    const rows = wholeRows(el, room + 8);
    const next = el.querySelector(NEXT)?.getBoundingClientRect(), top = el.getBoundingClientRect().top - el.scrollTop;
    const keep = next && next.top - top < room ? next.bottom - top : 0; // where the next tap fills, if any of it shows
    if (all <= room + 8) room = Math.max(room, all);
    else if (rows >= Math.max(LINE, keep)) room = rows;
  }
  if (!always && (all <= room + 1 || room >= parseFloat(el.style.maxHeight))) return;
  el.style.maxHeight = `${room}px`;
  scrollBox(el);
}

/**
 * The tallest height up to `limit` that ends on a whole row of what `el` holds, measured from its content's top as if
 * scrolled there: the end of something in it that cuts through nothing that has no parts (a chip, a block, a line of text).
 */
export function wholeRows(el, limit) {
  const top = el.getBoundingClientRect().top - el.scrollTop + parseFloat(getComputedStyle(el).paddingTop);
  const span = (r) => [r.top - top, r.bottom - top];
  const all = [...el.querySelectorAll('*')].map((c) => [c, c.getBoundingClientRect()]).filter(([, r]) => r.height);
  const text = document.createRange();
  const lines = [...el.querySelectorAll('*')].flatMap((c) => [...c.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()))
    .flatMap((n) => { text.selectNodeContents(n); return [...text.getClientRects()].map(span); });
  const parts = [...all.filter(([c]) => !c.childElementCount).map(([, r]) => span(r)), ...lines];
  const ends = all.map(([, r]) => r.bottom - top).filter((b) => b <= limit + 0.5 && !parts.some(([t, e]) => t < b - 0.5 && e > b + 0.5));
  return Math.max(0, ...ends);
}

const SQUARE = 28, PICK_SQUARE = 36; // the smallest a map's squares get for a tall program: Fennel stays easy to see, a square to tap thumb-sized

/**
 * Fits `program` (an element) between what is above it and `tray` (fixed at the bottom; none: the screen's bottom).
 * `world` and `g` are a map and its level (parse() in src/coding/program.js), if there is one; `lines` the coach's.
 * Returns:
 *   fit(words)   a program too tall for the space above the tray and above the verdict to come (`words` long)
 *                first gets the room the coach and the gaps can give (`.tall`), then the map's. If even that can't fit
 *                it above the verdict (a short phone), the map gives only what fits it above the tray, so it reads
 *                whole while asked, and its box shrinks when the verdict comes. What can't fit scrolls in its own box.
 *                A program that fits is left as it is.
 *   settle(el, always)  once answered: the program's box ends above the verdict as it really came (`boxTo`), with `el` in view;
 *                if that would leave less than a LINE of it, the coach gives way first (`.tall`)
 *   keep(el)     scrolls the program's box to `el`
 */
export function fitter({ program, tray, world = null, g = null, lines }) {
  const trayed = () => tray?.isConnected && tray.children.length;
  const trayTop = () => (trayed() ? tray.getBoundingClientRect().top : innerHeight);
  const fit = (words) => {
    const verdict = Math.min(trayTop(), innerHeight - verdictHeight(words, lines));
    const over = (bottom) => program.scrollHeight - (bottom - topOf(program) - 8);
    if (over(verdict) <= 0) return;
    program.classList.add('tall');
    const map = !!world?.isConnected;
    const high = map ? world.getBoundingClientRect().height : 0;
    const least = map ? g.h * (world.classList.contains('picking') ? PICK_SQUARE : SQUARE) : 0;
    const bottom = over(verdict) <= high - least ? verdict : trayTop();
    const fits = Math.max(least, high - over(bottom) - 4); // 4: the squares round to whole pixels
    if (map && fits < high) world.style.width = `${(fits * g.w) / g.h}px`;
    boxTo(program, bottom, false, trayed() && bottom === trayTop()); // the tray: a row is whole
  };
  const keep = (el) => keepInView(program, el);
  const settle = (el, always = false) => {
    const foot = document.querySelector('.foot.show');
    if (foot) {
      const bottom = innerHeight - foot.offsetHeight;
      const over = () => program.scrollHeight - (bottom - topOf(program) - 8);
      // Answered, the map is no longer tapped: if the program can't show whole above the verdict as it really came, the
      // map gives way first, down to an untapped map's squares (a predict item's were kept thumb-sized while asked).
      if (over() > 0 && world?.isConnected) {
        const high = world.getBoundingClientRect().height;
        const fits = Math.max(g.h * SQUARE, high - over() - 4);
        if (fits < high) world.style.width = `${(fits * g.w) / g.h}px`;
      }
      // Then, while a verdict taller than foreseen (a miss puts its reason first) leaves under a line: the coach gives way
      // (`.tall`), then her words keep only the room they take (`.tighter`).
      for (const c of ['tall', 'tighter']) if (bottom - topOf(program) - 8 < Math.min(LINE, program.scrollHeight) + 1) program.classList.add(c);
      // Never boxed to less than a LINE: past what the app promises (a 206px page) the page scrolls it clear of the verdict.
      // A box kept short above a tall tray while asked opens to the verdict once the tray has gone.
      const end = Math.max(bottom, topOf(program) + 8 + LINE);
      boxTo(program, end, always || parseFloat(program.style.maxHeight) < Math.min(program.scrollHeight, end - topOf(program) - 8));
    }
    keep(el);
  };
  return { fit, settle, keep };
}

/**
 * Fits a quiz card above whatever will cover the bottom of the screen: the answer tray while asked, the verdict
 * once answered (the same rule as Coding's `fit()`: fit first, never let the page scroll under a fixed bar). A card
 * that fits is left alone. Otherwise, in turn: the card gives up its spare room (`tight`), the coach shrinks
 * (`tall`), slots and the sentence above them shrink (`tighter`), pictures shrink, and last the card scrolls in its own box. A build's slots are measured full, as they
 * will be once answered. A code card (`.code-look`, the code courses' teach, predict and check cards) keeps the card and
 * scrolls its code instead, so the question under it stays put; and its answers, if there are more than leave the card
 * four lines of code, scroll in their own box first.
 */
export function fitCard(quiz, item, coach) {
  const card = quiz.querySelector('.card');
  const tray = quiz.querySelector('.choices');
  if (!card) { // a pairs item without a picture has none: if its pairs reach her words, she gives way, then they do
    const bubble = document.querySelector('.play .bubble');
    if (!tray || !bubble) return;
    const over = () => bubble.getBoundingClientRect().bottom - tray.getBoundingClientRect().top;
    for (const c of ['tall', 'tighter']) { if (over() <= 0) break; quiz.classList.add(c); }
    // Whatever the font does to the labels, the last of it scrolls in the tray's own box.
    if (over() > 0) { tray.style.maxHeight = `${Math.floor(tray.getBoundingClientRect().height - over())}px`; scrollBox(tray); }
    return;
  }
  const code = quiz.classList.contains('code-look') ? card.querySelector('.glyph') : null;
  if (code && tray?.children.length) {
    const line = parseFloat(getComputedStyle(code).lineHeight);
    const room = innerHeight - (card.getBoundingClientRect().top + Math.min(code.scrollHeight, 4 * line) + (card.offsetHeight - code.offsetHeight) + 8);
    if (tray.offsetHeight > room) { tray.style.maxHeight = `${Math.floor(room)}px`; scrollBox(tray); }
  }
  const slots = [...card.querySelectorAll('.slot')];
  const was = slots.map((s) => s.textContent);
  slots.forEach((s, i) => { s.textContent = item.answer[i]; });
  const limit = () => Math.min(tray?.children.length ? tray.getBoundingClientRect().top + scrollY : innerHeight,
    innerHeight - verdictHeight(item.type === 'teach' ? null : item.explain, coach?.lines));
  const over = () => card.getBoundingClientRect().bottom + scrollY - limit() + 8;
  if (over() > 0) {
    for (const c of ['tight', 'tall', 'tighter']) { quiz.classList.add(c); if (over() <= 0) break; }
    const pics = [...card.querySelectorAll('.pic')];
    if (over() > 0 && pics.length) {
      const high = pics.reduce((n, p) => n + p.getBoundingClientRect().height, 0);
      const k = Math.max(0.45, (high - over()) / high);
      for (const p of pics) p.style.maxWidth = `${Math.floor(p.getBoundingClientRect().width * k)}px`;
    }
    const box = code ?? card;
    if (over() > 0) { box.style.maxHeight = `${Math.floor(box.getBoundingClientRect().height - over())}px`; scrollBox(box); }
  }
  // A build's slots keep the rows they fill to (styles.css reads --rows), counted as the card has been fitted (a tighter
  // card's smaller slots fill fewer rows), so filling them never moves what is under them and no empty row is kept.
  if (slots.length) card.querySelector('.slots').style.setProperty('--rows', new Set(slots.map((s) => s.offsetTop)).size);
  slots.forEach((s, i) => { s.textContent = was[i]; });
}
