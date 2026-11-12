// HTML renderers for the photo journal. Pure string builders from state.
import { restaurants } from './catalog.mjs';
import { people, skins, petStage, areFriends, demoDay } from './social.mjs';
import { placeCoords, visiblePhotos, petMemories, validPhotoSrc } from './photos.mjs';

export const food = { 早餐: '🥐', 麵食: '🍜', 鍋物: '🍲', 咖啡: '☕', 甜點: '🍮', 飲品: '🍵' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = stamp => stamp ? stamp.slice(5, 10).replace('-', '/') + ' ' + stamp.slice(11, 16) : '';
const names = ids => ids.map(id => id === 'you' ? '你' : people[id]).join('、');
const skinIcon = id => skins.find(item => item.id === id)?.icon ?? '';

export function petOverlay(pet, handle = '') {
  if (!pet) return '';
  return `<span class="photo-pet" ${handle} style="--x:${(pet.x * 100).toFixed(1)}%;--y:${(pet.y * 100).toFixed(1)}%;--s:${pet.scale}">`
    + `${pet.stage}<i>${skinIcon(pet.skin)}</i></span>`;
}

export function photoImage(src, place, alt) {
  const image = photoSource(src);
  if (image) return `<img src="${image}" alt="${esc(alt)}">`;
  const p = restaurants.get(src?.slice(4)) ?? place;
  return `<div class="photo-art art-${p.price}" role="img" aria-label="${esc(alt)}"><span>${food[p.cuisine] ?? '🍽'}</span></div>`;
}

export function photoSource(src) {
  if (validPhotoSrc(src) && src.startsWith('data:')) return src;
  const sample = /^art:(4|7|9|10|12|13|14|16)$/.exec(src);
  return globalThis.document?.documentElement.dataset.ui && sample ? `./preview-photos/${sample[1]}.jpg` : '';
}

export function photoFrame(p, handle = '') {
  const place = restaurants.get(p.place);
  return `<div class="photo-frame">${photoImage(p.src, place, place.name + '的用餐照片')}${petOverlay(p.pet, handle)}</div>`;
}

export function photoCard(s, p) {
  const place = restaurants.get(p.place);
  const mine = p.actor === s.actor;
  const want = p.reactions.filter(r => r.kind === 'want');
  const together = p.reactions.filter(r => r.kind === 'together');
  const iWant = want.some(r => r.actor === s.actor);
  const myInvite = together.find(r => r.actor === s.actor);
  const summary = [want.length ? names(want.map(r => r.actor)) + ' 想吃' : '', together.length ? names(together.map(r => r.actor)) + ' 想約一起去' : ''].filter(Boolean).join(' · ');
  const actions = mine
    ? `${p.pet ? `<button type="button" data-photo-export="${esc(p.id)}">分享合照</button>` : ''}<button type="button" class="quiet" data-photo-delete="${esc(p.id)}">刪除</button>`
    : `<button type="button" class="react${iWant ? ' on' : ''}" aria-pressed="${iWant}" data-photo-react="want" data-id="${esc(p.id)}"><span aria-hidden="true">${iWant ? '♥' : '♡'}</span> 想吃</button>`
      + (myInvite ? `<button type="button" class="react on" data-page="gatherings">查看邀約</button>`
        : `<button type="button" class="react" data-photo-react="together" data-id="${esc(p.id)}">下次一起</button>`);
  return `<article class="photo-card" id="photo-${esc(p.id)}"><header><span class="avatar" aria-hidden="true">${(mine ? '你' : people[p.actor]).slice(0, 1)}</span>`
    + `<div><strong>${mine ? '你' : people[p.actor]}</strong><small>${when(p.takenAt)}${p.with.length ? ' · 和 ' + names(p.with) : ''}</small></div>`
    + `${mine ? `<span class="demo-badge">${p.audience === 'friends' ? '好友可見' : '只有我'}</span>` : ''}</header>`
    + photoFrame(p)
    + `<div class="photo-body"><h3><button type="button" class="text-button" data-detail="${place.id}">${esc(place.name)} <span aria-hidden="true">↗</span></button></h3>`
    + (p.caption ? `<p>${esc(p.caption)}</p>` : '')
    + (summary ? `<p class="reaction-summary">${esc(summary)}</p>` : '')
    + `<div class="photo-actions">${actions}</div></div></article>`;
}

export function invitesPanel(s) {
  const today = demoDay(s);
  const invites = s.events.filter(e => e.invited.includes(s.actor) && e.date.slice(0, 10) >= today);
  const mineSent = s.events.filter(e => e.host === s.actor && e.photo && e.date.slice(0, 10) >= today);
  if (!invites.length && !mineSent.length) return '';
  return `<section class="invite-strip"><h3>約飯</h3>`
    + invites.map(e => `<div class="invite-item"><p><strong>${people[e.host]}</strong> 約你 ${esc(e.date.replace('T', ' '))} 一起去 <strong>${esc(restaurants.get(e.place).name)}</strong></p>`
      + `<button type="button" class="primary" data-social="joinEvent" data-id="${esc(e.id)}">我要去</button></div>`).join('')
    + mineSent.map(e => `<div class="invite-item"><p>你約了 ${names(e.invited.length ? e.invited : e.members.filter(id => id !== s.actor))} 去 <strong>${esc(restaurants.get(e.place).name)}</strong> · ${e.members.length} 人已確認</p>`
      + `<button type="button" data-page="gatherings">看聚餐</button></div>`).join('')
    + `</section>`;
}

export function hasFriends(s) {
  return Object.keys(people).some(id => id !== s.actor && areFriends(s, s.actor, id));
}

// ---------- Record ----------
export function recordProgress(drafts) {
  const missingPlace = drafts.filter(draft => !restaurants.has(draft.place)).length;
  const missingTime = drafts.filter(draft => !Number.isFinite(Date.parse(draft.takenAt))).length;
  const remaining = [missingPlace && `尚有 ${missingPlace} 張未選店家`, missingTime && `${missingTime} 張待確認時間`].filter(Boolean);
  return remaining.join(' · ') || `${drafts.length} 張照片可發布`;
}

export function recordPage(s, drafts, { importing = false, message = '' } = {}) {
  const pet = s.pets[s.actor];
  const friendIds = Object.keys(people).filter(id => id !== s.actor && areFriends(s, s.actor, id));
  const options = [...restaurants.values()];
  const placeOption = (place, selected, hint) =>
    `<option value="${place.id}"${place.id === selected ? ' selected' : ''}>${esc(place.name)} · ${esc(hint)}</option>`;
  const card = (d, i) => {
    const place = restaurants.get(d.place);
    const petNow = d.petOn ? { ...d.pet, stage: petStage(pet.xp).icon, skin: pet.skin } : null;
    const nearby = d.candidates.map(({ place, km }) =>
      placeOption(place, d.place, km < 1 ? Math.round(km * 1000) + ' 公尺' : km.toFixed(1) + ' 公里'));
    const other = options.filter(option => !d.candidates.some(candidate => candidate.place.id === option.id))
      .map(option => placeOption(option, d.place, option.district));
    return `<section class="draft-card" data-draft="${i}" aria-labelledby="draft-title-${i}">
      <header class="draft-heading"><h3 id="draft-title-${i}">第 ${i + 1} 張照片</h3><button type="button" class="quiet" data-draft-remove="${i}" aria-label="移除第 ${i + 1} 張照片">移除</button></header>
      <div class="draft-fields">
        <div class="draft-main">
          <div class="photo-frame editable" data-pet-frame="${i}">${photoImage(d.src, place ?? { price: 2, cuisine: '' }, '待發布的照片')}${petOverlay(petNow, `data-pet-handle="${i}" role="slider" tabindex="0" aria-label="拖曳調整糰子位置，可用方向鍵微調" aria-valuetext="水平 ${Math.round(d.pet.x * 100)}%，垂直 ${Math.round(d.pet.y * 100)}%"`)}</div>
          <label>用餐店家
            <select data-draft-field="place" required>
              <option value="">選擇店家</option>
              ${nearby.length ? `<optgroup label="照片附近的店家">${nearby.join('')}</optgroup><optgroup label="其他店家">${other.join('')}</optgroup>` : other.join('')}
            </select>
            ${nearby.length && !place ? '<small class="muted">有附近店家建議</small>' : ''}
          </label>
        </div>
        <fieldset><legend>誰可以看</legend><div class="chip-checks">`
      + `<label><input type="radio" name="audience-${i}" value="friends" data-draft-field="audience"${d.audience === 'friends' ? ' checked' : ''}> 好友</label>`
      + `<label><input type="radio" name="audience-${i}" value="private" data-draft-field="audience"${d.audience === 'private' ? ' checked' : ''}> 只有我</label></div></fieldset>`
      + `<details class="draft-extras" data-draft-extras${d.extrasOpen ? ' open' : ''}>
          <summary>更多細節</summary>
          <div class="draft-extras-fields">
            <label>用餐時間<input type="datetime-local" data-draft-field="takenAt" value="${esc(d.takenAt)}" required><small class="muted">${d.dateSource === 'exif' ? '使用拍攝時間，可修改' : '使用檔案時間，可修改'}</small></label>
            <label>照片說明 <textarea data-draft-field="caption" maxlength="140" rows="2" placeholder="選填">${esc(d.caption)}</textarea></label>`
      + (friendIds.length ? `<fieldset><legend>同行者</legend><div class="chip-checks">${friendIds.map(id => `<label><input type="checkbox" data-draft-with="${id}"${d.with.includes(id) ? ' checked' : ''}> ${people[id]}</label>`).join('')}</div></fieldset>` : '')
      + `<label class="pet-toggle"><input type="checkbox" data-draft-field="petOn"${d.petOn ? ' checked' : ''}> 讓糰子入鏡</label>`
      + (d.petOn ? `<label>糰子大小<input type="range" min="10" max="60" value="${Math.round(d.pet.scale * 100)}" data-draft-field="petScale"></label><p class="muted">在照片上拖曳糰子，放到食物旁邊。</p>` : '')
      + `</div></details></div></section>`;
  };
  const full = drafts.length >= 6;
  const pickerLabel = full ? '已選滿 6 張' : drafts.length ? '新增照片' : '從相簿選照片';
  return `<div class="record-page">
    <h2 id="view-title">記下這一餐</h2>
    <div class="record-controls">
      <label class="upload-zone"><input type="file" id="photo-input" accept="image/*" multiple aria-describedby="photo-limits"${importing || full ? ' disabled' : ''}><strong>${pickerLabel}</strong></label>
      ${drafts.length < 5 ? `<button type="button" class="sample-link" data-record-sample${importing ? ' disabled' : ''}>用示範照片</button>` : ''}
    </div>
    <p class="record-note" id="photo-limits">最多 6 張，每張 15 MB。支援 JPEG、PNG、WebP 等格式。</p>
    <p class="record-note">照片座標只用來建議店家，不會儲存或分享。</p>
    <p class="record-message" role="status" data-record-message>${esc(importing ? '正在讀取照片…' : message)}</p>`
    + drafts.map(card).join('')
    + (drafts.length
      ? `<div class="publish-bar"><span id="record-progress" role="status" data-record-progress>${recordProgress(drafts)}</span><button type="button" class="primary" data-record-publish aria-describedby="record-progress"${importing ? ' disabled' : ''}>發布 ${drafts.length} 張</button></div>`
      : '<button type="button" class="record-rating text-button" data-page="search">找店評價</button>')
    + '</div>';
}

// ---------- Review ----------
export function reviewPage(s) {
  const mine = visiblePhotos(s, 'mine');
  const month = demoDay(s).slice(0, 7);
  const memories = petMemories(s, s.actor);
  const places = new Set(mine.map(p => p.place));
  const top = memories.friends[0];
  const groups = new Map();
  for (const p of mine) {
    const key = p.takenAt.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const pet = s.pets[s.actor];
  return `<p class="eyebrow">LOOK BACK</p><h2 id="view-title">吃過的，都記得。</h2>`
    + `<div class="review-stats"><div><strong>${mine.length}</strong>餐</div><div><strong>${mine.filter(p => p.takenAt.startsWith(month)).length}</strong>本月</div>`
    + `<div><strong>${places.size}</strong>家店</div><div><strong>${top ? esc(top.name) : '—'}</strong>最常一起吃</div></div>`
    + `<section class="pet-memory"><span class="pet-memory-icon" aria-hidden="true">${petStage(pet.xp).icon}<i>${skinIcon(pet.skin)}</i></span><div><h3>糰子的餐桌回憶</h3>`
    + `<p>入鏡 <strong>${memories.photos.length}</strong> 次${memories.friends.length ? ' · ' + memories.friends.map(f => `和 ${esc(f.name)} 吃過 ${f.count} 次`).join('、') : ''}</p>`
    + `<button type="button" data-page="pets">照顧糰子 ↗</button></div></section>`
    + (mine.length ? [...groups].map(([key, items]) => `<h3 class="month-title">${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月 · ${items.length} 餐</h3><div class="photo-grid">`
      + items.map(p => { const place = restaurants.get(p.place); return `<button type="button" class="photo-tile" data-detail="${place.id}" aria-label="${esc(place.name)} ${when(p.takenAt)}">${photoFrame(p)}<span>${esc(place.name)}<small>${when(p.takenAt).slice(0, 5)}</small></span></button>`; }).join('')
      + '</div>').join('')
      : '<p class="empty-state">還沒有紀錄。按下方「＋記錄」開始你的美食日記。</p>');
}

// ---------- Photo map ----------
export function photoMapPage(s, scope, focus) {
  const photos = visiblePhotos(s, scope);
  const coords = [...placeCoords.values()];
  const lat = coords.map(c => c.lat), lng = coords.map(c => c.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lat), Math.max(...lat), Math.min(...lng), Math.max(...lng)];
  const byPlace = new Map();
  for (const p of photos) byPlace.set(p.place, [...(byPlace.get(p.place) ?? []), p]);
  const pins = [...byPlace].map(([id, items]) => {
    const c = placeCoords.get(id), place = restaurants.get(id);
    const x = 8 + (c.lng - minLng) / (maxLng - minLng) * 84, y = 10 + (maxLat - c.lat) / (maxLat - minLat) * 80;
    const thumbnail = globalThis.document?.documentElement.dataset.ui && photoSource(items[0].src);
    return `<button type="button" class="photo-pin${focus === id ? ' active' : ''}" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%" data-map-place="${id}" aria-label="${esc(place.name)}，${items.length} 張照片">`
      + (thumbnail ? `<img src="${thumbnail}" alt="">` : `<span>${food[place.cuisine]}</span>`)
      + `${items.length > 1 ? `<b>${items.length}</b>` : ''}</button>`;
  }).join('');
  const list = focus && byPlace.has(focus) ? byPlace.get(focus) : photos;
  return `<p class="eyebrow">PHOTO MAP</p><h2 id="view-title">照片地圖</h2>`
    + `<div class="switcher" role="group" aria-label="照片範圍"><button type="button" data-map-scope="mine" aria-pressed="${scope === 'mine'}">我的</button><button type="button" data-map-scope="friends" aria-pressed="${scope === 'friends'}">朋友的</button></div>`
    + `<div class="photo-map" aria-label="照片地圖，示範位置"><svg aria-hidden="true" viewBox="0 0 480 300" preserveAspectRatio="none"><path d="M0 190Q150 230 260 160T480 190" fill="none" stroke="#c5dcdf" stroke-width="26"/><path d="M150 0v300M330 0v300M0 95h480M0 240h480M80 0v150M410 120v180" fill="none" stroke="#fff" stroke-width="9"/><rect x="175" y="18" width="110" height="46" rx="8" fill="#d3e0bc"/></svg>`
    + `<div class="map-labels"><span>北巷</span><span>中街</span><span>南埕</span></div>${pins}<span class="map-note">示範位置 · 台中市區</span></div>`
    + `<div class="section-heading"><h3>${focus && byPlace.has(focus) ? esc(restaurants.get(focus).name) : scope === 'mine' ? '我拍過的' : '朋友拍過的'} · ${list.length} 張</h3>`
    + `${focus ? '<button type="button" data-map-place="">顯示全部</button>' : ''}</div>`
    + (list.length ? list.map(p => photoCard(s, p)).join('')
      : `<p class="empty-state">${scope === 'mine' ? '還沒有照片。記下一餐，它就會出現在地圖上。' : hasFriends(s) ? '朋友還沒分享照片。' : '加入好友後，就能看到朋友吃過的地方。'}</p>`)
    + `<p class="muted record-alt">想找真實店家？<button type="button" class="text-button" data-page="explore">開啟 Google 地圖 ↗</button></p>`;
}
