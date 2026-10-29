// The Waymark demo: one public element of Moppetopia on a plain element page, with the fan-out beside
// its name, from the built subpath (dist/waymark.js and dist/waymark.css). The element's body is baked
// (element.json, as the API serves it to anyone; element-member.json, the same with the doors a member
// is served), so the page reads nothing from the network. Switches: ?entry=mark|menu|both,
// ?reader=member|guest|public, ?ground=dark|paper, ?signedIn=unknown|true|false; ?open=1 opens the
// fan-out on load, for a picture of it.

import { mountWaymark } from '../dist/waymark.js';

const WORLD = { id: '0695db52-5433-7332-8000-db7fe10da375', name: 'Moppetopia' };
const q = new URLSearchParams(location.search);
const pick = (key, values) => (values.includes(q.get(key)) ? q.get(key) : values[0]);
const entry = pick('entry', ['mark', 'menu', 'both']);
const reader = pick('reader', ['member', 'guest', 'public']);
const ground = pick('ground', ['dark', 'paper']);
const signedIn = { unknown: null, true: true, false: false }[pick('signedIn', ['unknown', 'true', 'false'])];
const current = { entry, reader, ground, signedIn: q.get('signedIn') ?? 'unknown' };
const openOnLoad = q.get('open') === '1';

document.documentElement.classList.add(`ground-${ground}`);
for (const a of document.querySelectorAll('[data-set]')) {
  const [k, v] = a.dataset.set.split('=');
  const next = new URLSearchParams({ ...current, [k]: v });
  a.href = `?${next}`;
  if (current[k] === v) a.setAttribute('aria-current', 'true');
}

const element = await (await fetch(reader === 'public' ? 'element.json' : 'element-member.json')).json();
const name = document.getElementById('name');
name.textContent = element.name;
document.getElementById('meta').textContent = [element.supertype, element.subtype].filter(Boolean).join(' / ');
document.getElementById('desc').textContent = element.description ?? '';
const fields = document.getElementById('fields');
for (const [k, v] of [['Birth date', element.birth_date], ['Created', element.created_at?.slice(0, 10)]]) {
  if (v === null || v === undefined) continue;
  fields.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: String(v) }));
}

// The page's own "..." menu: the entry (menu or both) goes first in it, and Escape from a fan-out it
// opened brings focus back to the "..." button, which stays visible when the menu closes.
const moreButton = document.querySelector('.more-button');
const moreMenu = document.querySelector('.more-menu');
const waymark = mountWaymark(name, {
  world: WORLD, element, reader, ground, entry, signedIn, returnFocus: entry === 'mark' ? null : moreButton,
});
if (waymark.entry) {
  waymark.entry.setAttribute('role', 'menuitem');
  waymark.entry.classList.add('more-item');
  moreMenu.prepend(waymark.entry);
  waymark.entry.addEventListener('click', () => setMore(false));
}
function setMore(open) {
  moreMenu.hidden = !open;
  moreButton.setAttribute('aria-expanded', String(open));
  if (open) moreMenu.querySelector('.more-item')?.focus();
}
moreButton.addEventListener('click', () => setMore(moreMenu.hidden));
moreMenu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setMore(false);
    moreButton.focus();
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!moreMenu.hidden && !e.target.closest('.more')) setMore(false);
});
if (openOnLoad) (waymark.entry ?? document.querySelector('.ow-waymark__mark')).click();
