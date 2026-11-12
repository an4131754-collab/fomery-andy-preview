// Photo journal domain: EXIF reading, place suggestions, sharing and reactions.
// Pure functions only; the DOM layer lives in app.mjs.
import { restaurants } from './catalog.mjs';
import { areFriends, demoDay, petStage, people } from './social.mjs';

// Demo coordinates around downtown Taichung. The restaurants are fictional,
// so these positions are illustrative, not real addresses.
const center = { lat: 24.1477, lng: 120.6736 };
export const placeCoords = new Map([...restaurants.values()].map(place => {
  const i = Number(place.id) - 1;
  const row = Math.floor(i / 6);
  return [place.id, {
    lat: +(center.lat + (1 - row) * 0.012 + ((i % 3) - 1) * 0.0025).toFixed(5),
    lng: +(center.lng + ((i % 6) - 2.5) * 0.006).toFixed(5),
  }];
}));

export const photoTypes = new Set(['photo', 'react', 'deletePhoto']);
export const validPhotoSrc = src => typeof src === 'string'
  && (/^art:\d{1,2}$/.test(src) || /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(src));
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

// ---------- EXIF ----------
const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function readExif(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return {};
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      const size = view.getUint16(offset + 2);
      if (marker === 0xFFE1 && ascii(view, offset + 4, 6) === 'Exif\0\0') {
        return parseTiff(view, offset + 10);
      }
      offset += 2 + size;
    }
  } catch { /* malformed or truncated EXIF: treat as absent */ }
  return {};
}

function ascii(view, at, length) {
  let text = '';
  for (let i = 0; i < length && at + i < view.byteLength; i += 1) text += String.fromCharCode(view.getUint8(at + i));
  return text;
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = at => view.getUint16(start + at, little);
  const u32 = at => view.getUint32(start + at, little);
  const ifd = at => {
    const tags = new Map();
    const count = u16(at);
    for (let i = 0; i < count; i += 1) {
      const entry = at + 2 + i * 12;
      const type = u16(entry + 2), n = u32(entry + 4);
      const bytes = (typeSize[type] || 1) * n;
      tags.set(u16(entry), { type, n, at: bytes <= 4 ? entry + 8 : u32(entry + 8) });
    }
    return tags;
  };
  const text = tag => tag && ascii(view, start + tag.at, tag.n).replace(/\0.*$/, '');
  const rationals = tag => Array.from({ length: tag.n }, (_, i) => {
    const den = u32(tag.at + i * 8 + 4);
    return den ? u32(tag.at + i * 8) / den : 0;
  });
  const result = {};
  const ifd0 = ifd(u32(4));
  const exif = ifd0.has(0x8769) ? ifd(u32(ifd0.get(0x8769).at)) : new Map();
  const stamp = text(exif.get(0x9003)) || text(ifd0.get(0x0132));
  const match = stamp && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(stamp);
  if (match) result.takenAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  if (ifd0.has(0x8825)) {
    const gps = ifd(u32(ifd0.get(0x8825).at));
    if ([1, 2, 3, 4].every(tag => gps.has(tag))) {
      const toDeg = ([d, m, s]) => d + m / 60 + s / 3600;
      const lat = toDeg(rationals(gps.get(2))) * (text(gps.get(1)) === 'S' ? -1 : 1);
      const lng = toDeg(rationals(gps.get(4))) * (text(gps.get(3)) === 'W' ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) Object.assign(result, { lat, lng });
    }
  }
  return result;
}

// ---------- Places ----------
export function distanceKm(a, b) {
  const rad = deg => deg * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function nearbyPlaces(point, { limit = 3, maxKm = 1.5 } = {}) {
  return [...placeCoords].map(([id, coords]) => ({ place: restaurants.get(id), km: distanceKm(point, coords) }))
    .filter(item => item.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, limit);
}

// ---------- Dates ----------
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function nextSaturday(day) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + 2);
  while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
  return isoDay(date) + 'T18:30';
}

export function localStamp(ms) {
  const d = new Date(ms);
  return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Visibility ----------
export function visiblePhotos(s, scope) {
  const viewer = s.actor;
  return (s.photos ?? []).filter(p => scope === 'mine' ? p.actor === viewer
    : p.actor !== viewer && p.audience === 'friends' && areFriends(s, viewer, p.actor))
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

export function petMemories(s, owner) {
  const photos = (s.photos ?? []).filter(p => p.actor === owner && p.pet);
  const counts = new Map();
  for (const p of (s.photos ?? []).filter(p => p.actor === owner)) {
    for (const id of p.with) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { photos, friends: [...counts].map(([id, count]) => ({ id, name: people[id], count })).sort((a, b) => b.count - a.count) };
}

// ---------- Transitions ----------
export function photoTransition(state, action) {
  const s = structuredClone(state);
  s.photos ??= [];
  const actor = s.actor;
  switch (action.type) {
    case 'photo': {
      requireThat(restaurants.has(action.place), '請選擇這餐的店家');
      requireThat(validPhotoSrc(action.src), '照片格式無法使用，請重新選擇');
      requireThat(typeof action.takenAt === 'string' && Number.isFinite(Date.parse(action.takenAt)), '請確認用餐日期');
      const caption = String(action.caption ?? '').trim();
      requireThat(caption.length <= 140, '照片說明請在 140 字以內');
      requireThat(['friends', 'private'].includes(action.audience), '請選擇分享對象');
      const withIds = [...new Set(action.with ?? [])];
      requireThat(withIds.every(id => Object.hasOwn(people, id) && id !== actor && areFriends(s, actor, id)), '同行者只能選擇你的好友');
      const pet = action.pet;
      requireThat(pet === null || pet === undefined || (
        [pet.x, pet.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
        && Number.isFinite(pet.scale) && pet.scale >= .1 && pet.scale <= .6), '寵物位置不正確，請重新調整');
      const owner = s.pets[actor];
      const day = demoDay(s);
      let growth = null;
      if (action.audience === 'friends') {
        const before = owner.xp, rewarded = !owner.rewardedDays.includes(day);
        if (rewarded) { owner.rewardedDays.push(day); owner.xp += 20; owner.coins += 30; }
        growth = { before, after: owner.xp, xp: owner.xp - before, coins: rewarded ? 30 : 0, evolved: petStage(before).name !== petStage(owner.xp).name };
      }
      s.photos.unshift({
        id: action.id && !s.photos.some(p => p.id === action.id) ? action.id : crypto.randomUUID(),
        actor, place: action.place, takenAt: action.takenAt, src: action.src, caption,
        audience: action.audience, with: withIds,
        pet: pet ? { x: pet.x, y: pet.y, scale: pet.scale, skin: owner.skin, stage: petStage(owner.xp).icon } : null,
        reactions: [], growth,
      });
      break;
    }
    case 'react': {
      const p = s.photos.find(item => item.id === action.id);
      requireThat(p, '找不到這張照片');
      requireThat(p.actor !== actor, '這是你自己的照片');
      requireThat(p.audience === 'friends' && areFriends(s, actor, p.actor), '只能回應好友分享的照片');
      if (action.kind === 'want') {
        const had = p.reactions.some(r => r.actor === actor && r.kind === 'want');
        p.reactions = had ? p.reactions.filter(r => !(r.actor === actor && r.kind === 'want'))
          : [...p.reactions, { actor, kind: 'want' }];
      } else if (action.kind === 'together') {
        requireThat(!p.reactions.some(r => r.actor === actor && r.kind === 'together'), '已經約過這一餐了，到聚餐頁看看回覆');
        const group = s.groups.find(g => g.members.includes(actor) && g.members.includes(p.actor));
        requireThat(group, '你們還沒有共同群組，先邀對方加入一個群組');
        const event = { id: crypto.randomUUID(), title: `一起去吃${restaurants.get(p.place).name}`, group: group.id, place: p.place,
          date: nextSaturday(demoDay(s)), capacity: 4, host: actor, members: [actor], invited: [p.actor], photo: p.id };
        s.events.unshift(event);
        p.reactions.push({ actor, kind: 'together', event: event.id });
      } else throw new Error('不支援的回應');
      break;
    }
    case 'deletePhoto': {
      const p = s.photos.find(item => item.id === action.id);
      requireThat(p && p.actor === actor, '只能刪除自己的照片');
      s.photos = s.photos.filter(item => item.id !== action.id);
      break;
    }
    default: throw new Error('不支援的操作');
  }
  return s;
}

// ---------- Demo data ----------
export function seedPhotos(s) {
  const day = offset => { const d = new Date(); d.setDate(d.getDate() + s.dayOffset - offset); return isoDay(d); };
  const make = (actor, place, offset, time, caption, withIds, pet) => ({
    id: `seed-${actor}-${place}`, actor, place, takenAt: `${day(offset)}T${time}`, src: `art:${place}`, caption,
    audience: 'friends', with: withIds, pet, reactions: [], growth: null,
  });
  return [
    make('jamie', '14', 0, '12:30', '新的週末基地。拿鐵很順，窗邊可以坐一整個下午。', [], { x: .72, y: .7, scale: .26, skin: 'chef', stage: '🐥' }),
    make('alex', '10', 1, '10:15', '睡晚一點也不怕，這份早午餐值得專程來。', ['jamie'], null),
    make('jamie', '13', 3, '19:05', '冷天就是要小火鍋，和 Alex、你一起吃最剛好。', ['alex', 'you'], { x: .25, y: .72, scale: .22, skin: 'classic', stage: '🐥' }),
    make('mika', '16', 1, '15:40', '冰菓室的芒果冰還在，夏天好像沒有走。', [], null),
    make('you', '7', 2, '14:10', '把下午留給一杯咖啡。', ['jamie'], { x: .7, y: .68, scale: .28, skin: 'classic', stage: '🐣' }),
    make('you', '4', 6, '12:05', '湯頭很有層次，下次還想再來。', ['alex'], null),
  ];
}
