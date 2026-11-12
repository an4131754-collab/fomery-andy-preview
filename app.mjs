import { restaurants, createDemoState } from './catalog.mjs';
import { mapsUrl, googleExploreEmbedUrl } from './maps.mjs';
import { createSocialState, transition, people, petStage, skins } from './social.mjs';
import { community, gatherings, pets, growthReceipt, socialToolbar, petCard } from './social-ui.mjs';
import { beginRanking, compare, finishRanking, moods, opponent, progress, score } from './ranking.mjs';
import { readExif, nearbyPlaces, placeCoords, photoTransition, photoTypes, seedPhotos, localStamp, visiblePhotos, petMemories } from './photos.mjs';
import { food, recordPage, recordProgress, reviewPage, photoMapPage, hasFriends, photoSource } from './photo-ui.mjs';
import { journalActivity } from './ui-preview.mjs';

const requestedUi = new URLSearchParams(location.search).get('ui');
const previewUi = ['feed', 'album', 'friends'].includes(requestedUi) ? requestedUi : '';
const key = previewUi ? 'fomery-ui-preview-' + previewUi : 'table-notes-demo-v2';
if (previewUi) {
  document.documentElement.dataset.ui = previewUi;
  document.querySelector('.brand').href = '?ui=' + previewUi;
  document.querySelector('.preview-options-link').hidden = false;
}
const empty = { ranked: [], saved: [], recent: [] };
const view = document.querySelector('#view');
const dialog = document.querySelector('#dialog');
const form = document.querySelector('#rating-form');
const fields = document.querySelector('#details-form');
const comparison = document.querySelector('#comparison');
const extras = document.querySelector('#extras');
const submit = form.querySelector('[type="submit"]');
const status = document.querySelector('#status');
const error = document.querySelector('#dialog-error');
const labels = { liked: '喜歡', fine: '普通', disliked: '不喜歡' };
const all = [...restaurants.values()];
const filters = { district: '', cuisine: '', price: '' };
const tour = [
  { title: '01 / 拍下這一餐', summary: '到「＋記錄」用示範照片試試：拍攝時間自動帶入，有位置的照片會推薦附近店家讓你確認。讓糰子入鏡、拖到食物旁邊，分享給好友。', action: '記下這一餐', page: 'record' },
  { title: '02 / 朋友看到，想一起吃', summary: '在動態上方把角色切成 Jamie，對你剛發的照片按「下次一起」。不用填表單，系統直接在你們的共同群組發出週六的邀約。', action: '看朋友的動態', page: 'activity' },
  { title: '03 / 赴約，然後回顧', summary: '切回你的角色，在動態按「我要去」。到「回顧」看這個月吃了幾餐、糰子入鏡幾次、和誰吃得最多。', action: '打開回顧', page: 'review' },
];
const navParent = { community: 'profile', gatherings: 'profile', pets: 'profile', lists: 'profile', search: 'profile', explore: 'map', tour: 'profile' };
let noticeTimer;
let page = 'activity';
let previewPhoto = '';
let drafts = [];
let importingDrafts = null;
let recordMessage = '';
let mapScope = 'friends';
let mapFocus = '';
let listMap = false;
let tourStep = 0;
let selected = null;
let ratingId = null;
let ratingSession = 0;
let draft = null;
let query = '';
let mapQuery = '台中市 餐廳';
let state = load();
if (!state.social) state = { ...state, social: freshSocial() };
if (!Array.isArray(state.social.photos)) state = { ...state, social: { ...state.social, photos: seedPhotos(state.social) } };

function freshSocial() {
  const social = createSocialState();
  return { ...social, photos: seedPhotos(social) };
}

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!value) return createDemoState();
    const validRank = row => row && restaurants.has(row.id) && moods.includes(row.mood)
      && Number.isFinite(row.value) && Array.isArray(row.tags)
      && row.tags.every(tag => typeof tag === 'string');
    if (![value.ranked, value.saved, value.recent].every(Array.isArray)
        || !value.ranked.every(validRank)
        || ![...value.saved, ...value.recent].every(id => restaurants.has(id))) {
      throw new Error('Invalid stored records');
    }
    return value;
  } catch {
    notify('讀取本機紀錄失敗，暫以空白清單顯示。');
    return empty;
  }
}

function notify(message) {
  clearTimeout(noticeTimer);
  status.textContent = message;
  noticeTimer = setTimeout(() => { status.textContent = ''; }, 4500);
}

function save(next, message) {
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    (dialog.open ? error : status).textContent = '無法儲存。請確認瀏覽器允許本機儲存，或換一張較小的照片。';
    return false;
  }
  state = next;
  if (message) notify(message);
  return true;
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function artwork(place, large = false) {
  return '<span aria-hidden="true" class="food-art ' + (large ? 'large' : '') + ' art-' + place.price + '"><span>' + food[place.cuisine] + '</span></span>';
}

function rows(places) {
  if (!places.length) return '<p class="muted">這裡目前沒有店家。</p>';
  return '<ul class="rows">' + places.map(place => {
    const ranked = state.ranked.find(entry => entry.id === place.id);
    const pos = ranked ? state.ranked.findIndex(entry => entry.value === ranked.value) : -1;
    const isSaved = state.saved.includes(place.id);
    const rating = score(place.id, state.ranked);
    const rank = pos === -1 ? '' : ' · 第 ' + (pos + 1) + ' 名' + (rating ? ' · ' + rating + ' 分' : '');
    return '<li class="row">' + artwork(place) + '<button type="button" class="title" data-detail="' + place.id + '">'
      + '<strong>' + escape(place.name) + '</strong><small>' + place.district + ' · ' + place.cuisine + rank + '</small></button>'
      + (rating ? '<span class="score">' + rating + '</span>' : '')
      + '<button type="button" data-rate="' + place.id + '" aria-label="' + escape((pos < 0 ? '評價 ' : '重評 ') + place.name) + '">'
      + (pos < 0 ? '＋' : '重評') + '</button>'
      + '<button type="button" class="bookmark" data-bookmark="' + place.id + '" aria-pressed="' + isSaved + '" aria-label="' + escape('想去 ' + place.name) + '">想去</button></li>';
  }).join('') + '</ul>';
}

function drawResults() {
  const term = query.trim().toLowerCase();
  const places = term ? all.filter(place => [place.name, place.cuisine, place.district]
    .some(value => value.toLowerCase().includes(term))) : all;
  const recent = state.recent.map(id => restaurants.get(id));
  document.querySelector('#results').innerHTML = (!term && recent.length
    ? '<h3>最近搜尋</h3>' + rows(recent) : '')
    + '<h3>' + (term ? '搜尋結果' : '附近範例店家') + '</h3>' + rows(places);
}

function detail(place) {
  const row = state.ranked.find(entry => entry.id === place.id);
  const rank = row ? state.ranked.findIndex(entry => entry.value === row.value) + 1 : null;
  const rating = score(place.id, state.ranked);
  const image = row?.photo && typeof row.photo === 'string' && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(row.photo)
    ? '<img src="' + row.photo + '" alt="此餐紀錄的照片">' : '';
  const isSaved = state.saved.includes(place.id);
  return '<button type="button" data-back>← 返回</button>'
    + '<article class="place detail-place">' + artwork(place, true) + '<p class="eyebrow">A PLACE TO REMEMBER</p><h2 id="view-title">' + place.name + '</h2>'
    + '<p class="muted">' + place.city + ' · ' + place.district + ' · ' + place.cuisine + '</p>'
    + (row ? '<p><strong>第 ' + rank + ' 名</strong> · ' + labels[row.mood]
      + (rating ? ' · ' + rating + ' 分' : ' · 排滿 10 家顯示分數') + '</p>' : '')
    + '<div class="place-actions"><button type="button" class="primary" data-rate="' + place.id + '">' + (row ? '重新評價' : '加入吃過') + '</button> '
    + '<button type="button" class="bookmark" aria-pressed="' + isSaved + '" data-bookmark="' + place.id + '">' + (isSaved ? '已收藏' : '存為想去') + '</button></div>'
    + '<p><a class="map-link" href="' + escape(mapsUrl('台南市 ' + place.cuisine)) + '" target="_blank" rel="noopener noreferrer">Google Maps 找同類餐廳 ↗</a></p><p class="muted">此店為虛構示範，連結搜尋真實同類餐廳，不是此店的地址。</p>'
    + '<p class="detail-description">' + ({ 咖啡: '留一點時間給咖啡香，和不趕時間的自己。', 早餐: '從一份用心的早餐，開始今天的小旅行。', 麵食: '熱騰騰的一碗，收好日常裡最踏實的幸福。' }[place.cuisine] || '把生活的滋味，留在這一餐。') + '</p>'
    + (row?.dish ? '<p>喜歡的菜　' + escape(row.dish) + '</p>' : '')
    + (row?.date ? '<p>用餐日期　' + escape(row.date) + '</p>' : '')
    + (row?.companions ? '<p>同行者　' + escape(row.companions) + '</p>' : '')
    + (row?.tags.length ? '<p>標籤　' + escape(row.tags.join('、')) + '</p>' : '')
    + (row?.note ? '<p>' + escape(row.note) + '</p>' : '') + image
    + (row && state.ranked.length === 1 ? '<section class="first-rank"><h3>你記下第一家店了</h3>'
      + '<p>再評一家，就能開始累積自己的口味排行。</p>'
      + '<button type="button" data-next>再評一家</button></section>' : '')
    + '</article>';
}

function drawMap(places) {
  // shortcut: schematic coordinates only; replace with geocoded places when a real catalog is available.
  const pins = places.map(place => {
    const i = Number(place.id) - 1;
    const x = 17 + Math.floor(i / 6) * 33 + (i % 2 ? 7 : -7);
    const y = 31 + Math.floor(i % 6 / 2) * 24 + (i % 2 ? 7 : 0);
    return '<button type="button" class="map-pin" data-detail="' + place.id
      + '" aria-label="地圖上的 ' + escape(place.name) + '" style="--x:' + x + '%;--y:' + y + '%">'
      + (score(place.id, state.ranked) || place.id) + '</button>';
  }).join('');
  return '<div class="map" aria-label="虛構街區示意圖">'
    + '<svg aria-hidden="true" viewBox="0 0 480 230" preserveAspectRatio="none">'
    + '<path d="M0 146Q145 185 257 128T480 154" fill="none" stroke="#c5dcdf" stroke-width="28"/>'
    + '<path d="M143 0v230M338 0v230M0 76h480M0 198h480M86 0v115M404 92v138" fill="none" stroke="#fff" stroke-width="9"/>'
    + '<rect x="163" y="14" width="110" height="40" rx="8" fill="#d3e0bc"/></svg>'
    + '<div class="map-labels"><span>北巷</span><span>中街</span><span>南埕</span></div>' + pins + '</div>';
}

function mapPanel(places) {
  const destination = mapQuery.trim() || '台中市 餐廳';
  const route = destination !== '台中市 餐廳';
  return '<section class="map-workspace"><div class="map-canvas-panel"><div class="section-heading"><h3>我的美食地圖</h3><span class="demo-badge">Google Maps · 台中</span></div><div class="google-map-frame"><iframe src="' + escape(googleExploreEmbedUrl) + '" title="我的美食地圖：Google Maps 台中市區" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>'
    + '<div class="google-map-card"><span class="eyebrow">EXPLORE WITH GOOGLE MAPS</span><h3>把下一餐，放到真實地圖上。</h3><form id="maps-form" action="https://www.google.com/maps/search/" method="get" target="_blank" rel="noopener noreferrer"><input type="hidden" name="api" value="1"><label for="map-query">真實店名、地址或地區＋料理</label><input id="map-query" name="query" value="' + escape(mapQuery) + '" required maxlength="180" placeholder="例如：台中市西區 咖啡"><div class="action-row"><button class="primary" type="submit">在 Google Maps 搜尋 ↗</button><a class="map-link" id="map-directions" href="' + escape(mapsUrl(destination, route ? 'directions' : 'search')) + '" target="_blank" rel="noopener noreferrer">' + (route ? '規劃前往此地的路線 ↗' : '開啟 Google Maps ↗') + '</a></div><p class="muted">可直接拖曳、縮放上方 Google 地圖。搜尋與路線另開 Google Maps；下方示範店家未標示於真實地圖。</p></form></div></div><aside class="map-place-list"><h3>清單中的店家 · ' + places.length + '</h3><p class="muted">點店名查看紀錄 · 以下為示範店家</p>' + rows(places) + '</aside></section>';
}

function filterSelect(key, label) {
  const options = [...new Set(all.map(place => String(place[key])))];
  return '<label>' + label + '<select data-filter="' + key + '"><option value="">全部</option>'
    + options.map(value => '<option value="' + escape(value) + '"' + (filters[key] === value ? ' selected' : '')
      + '>' + (key === 'price' ? '＄'.repeat(Number(value)) : escape(value)) + '</option>').join('')
    + '</select></label>';
}

function exploration() {
  const { count, target, unlocked } = progress(state.ranked);
  const completed = Math.min(count, target);
  const favorite = state.ranked.find(row => row.mood === 'liked')?.cuisine;
  const matches = place => Object.entries(filters).every(([key, value]) => !value || String(place[key]) === value);
  const unseen = all.filter(place => matches(place) && !state.ranked.some(row => row.id === place.id));
  const suggestions = unseen.filter(place => place.cuisine === favorite);
  return '<p class="eyebrow">YOUR NEXT FOOD ADVENTURE</p><h2 id="view-title">探索美食地圖</h2><p class="muted">整理口袋名單，再到 Google Maps 探索真實餐廳。</p>'
    + '<div class="filters">' + filterSelect('district', '街區') + filterSelect('cuisine', '料理')
    + filterSelect('price', '價位') + '</div>' + mapPanel(all.filter(matches))
    + '<section class="progress-box"><h3>個人化推薦進度</h3>'
    + '<progress aria-label="個人化推薦進度" value="' + completed + '" max="' + target + '"></progress>'
    + '<p><strong>' + completed + ' / ' + target + '</strong></p>'
    + (unlocked ? '<p>根據你喜歡的料理，挑選下一家想去的店。</p>' + rows((suggestions.length ? suggestions : unseen).slice(0, 4))
      : '<p>評價 ' + target + ' 家就能解鎖。</p><button type="button" class="primary" data-next>繼續評價</button>')
    + '</section>';
}

function drawTour() {
  const step = tour[tourStep];
  return '<section class="place tour-card"><p class="eyebrow">' + (tourStep + 1) + ' / ' + tour.length + '</p>'
    + '<h2 id="view-title">' + step.title + '</h2><p>' + step.summary + '</p>'
    + '<div class="tour-visual" aria-hidden="true">' + ['📸', '🍽', '🐣'][tourStep] + '</div><div class="tour-actions">'
    + '<button type="button" data-tour-step="-1"' + (tourStep === 0 ? ' disabled' : '') + '>上一張</button>'
    + '<button type="button" data-tour-step="1"' + (tourStep === tour.length - 1 ? ' disabled' : '') + '>下一張</button>'
    + '<button type="button" class="primary" data-page="' + step.page + '">' + step.action + '</button></div></section>';
}

function render() {
  const current = navParent[page] ?? page;
  for (const button of document.querySelectorAll('nav [data-page]')) {
    if (button.dataset.page === current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (selected) view.innerHTML = detail(restaurants.get(selected));
  else if (page === 'search') {
    view.innerHTML = '<p class="eyebrow">FIND YOUR NEXT FAVORITE</p><h2 id="view-title">今天，想吃點什麼？</h2><p class="muted">搜尋 18 家示範店家，找到下一個喜歡。</p><input type="search" id="search" aria-label="搜尋店名或料理" placeholder="搜尋店名或料理"><div id="results"></div>';
    document.querySelector('#search').value = query;
    drawResults();
  } else if (page === 'lists') {
    const been = state.ranked.map(row => restaurants.get(row.id));
    const saved = state.saved.map(id => restaurants.get(id));
    view.innerHTML = '<p class="eyebrow">CURATED BY YOUR TASTE</p><h2 id="view-title">我的口袋名單</h2><p class="muted">吃過 ' + been.length + ' 家 · 想去 ' + saved.length + ' 家 · 分數由個人比較產生</p><div class="switcher">'
      + '<button type="button" data-list-view="list" aria-pressed="' + !listMap + '">清單</button>'
      + '<button type="button" data-list-view="map" aria-pressed="' + listMap + '">地圖</button></div>'
      + (listMap ? mapPanel([...been, ...saved.filter(place => !been.some(row => row.id === place.id))])
        : '<h3>吃過</h3>' + rows(been) + '<h3>想去</h3>' + rows(saved));
  } else if (page === 'activity') {
    const toolbar = socialToolbar(state.social);
    view.innerHTML = journalActivity(previewUi || 'feed', state.social, toolbar, previewPhoto);
  } else if (page === 'record') {
    view.innerHTML = recordPage(state.social, drafts, { importing: importingDrafts === drafts, message: recordMessage });
  } else if (page === 'review') {
    view.innerHTML = reviewPage(state.social);
  } else if (page === 'map') {
    if (mapScope === 'friends' && !hasFriends(state.social)) mapScope = 'mine';
    view.innerHTML = photoMapPage(state.social, mapScope, mapFocus);
  } else if (page === 'community') {
    view.innerHTML = community(state.social);
  } else if (page === 'gatherings') {
    view.innerHTML = gatherings(state.social);
  } else if (page === 'pets') {
    view.innerHTML = pets(state.social);
  } else if (page === 'profile') {
    view.innerHTML = profilePage();
  } else view.innerHTML = page === 'tour' ? drawTour() : exploration();
}

function profilePage() {
  const s = state.social, actor = s.actor, pet = s.pets[actor], stage = petStage(pet.xp);
  const mine = visiblePhotos(s, 'mine');
  const memories = petMemories(s, actor);
  const invites = s.events.filter(e => e.invited.includes(actor)).length;
  const link = (target, icon, label, note = '') => '<button type="button" class="profile-link" data-page="' + target + '"><span aria-hidden="true">' + icon + '</span>' + label + (note ? '<small>' + note + '</small>' : '') + '</button>';
  return '<h2 id="view-title">我的</h2>'
    + '<section class="place profile-card"><span class="avatar">' + escape(people[actor].slice(0, 1)) + '</span><h3>' + escape(people[actor]) + '</h3>'
    + '<p>照片 <strong>' + mine.length + '</strong> 張 · 吃過 <strong>' + state.ranked.length + '</strong> 家 · 想去 <strong>' + state.saved.length + '</strong> 家</p></section>'
    + '<section class="pet-home">' + petCard(s, actor) + '<div><h3>' + stage.name + '</h3>'
    + '<progress value="' + Math.min(pet.xp, stage.next) + '" max="' + stage.next + '" aria-label="寵物進化進度"></progress>'
    + '<p class="muted">' + (pet.xp >= 140 ? '已是最終型態' : '再 ' + (stage.next - pet.xp) + ' XP 進化') + ' · 每天第一張分享給好友的照片 +20 XP</p>'
    + '<p>入鏡 ' + memories.photos.length + ' 次' + (memories.friends[0] ? ' · 最常和 ' + escape(memories.friends[0].name) + ' 一起吃' : '') + '</p>'
    + '<button type="button" data-page="pets">照顧糰子・換造型</button></div></section>'
    + '<div class="profile-links">'
    + link('community', '♧', '好友與群組') + link('gatherings', '♨', '聚餐', invites ? invites + ' 個邀約' : '')
    + link('lists', '☷', '我的清單') + link('search', '⌕', '找店評價') + link('explore', '◎', 'Google 地圖') + link('tour', '▶', '90 秒導覽')
    + '</div><details class="preview-tools"><summary>展示設定</summary>' + socialToolbar(s)
    + '<p>店家與好友為示範資料，紀錄只保存在此瀏覽器。</p><button type="button" data-reset>重設展示資料</button></details>';
}

const draftDefaults = () => ({ caption: '', with: [], audience: 'friends', petOn: false, pet: { x: .74, y: .7, scale: .28 }, place: '' });

function focusDraftField(index, field) {
  const input = view.querySelector(`[data-draft="${index}"] [data-draft-field="${field}"]`);
  input?.focus();
  return input;
}

async function cropPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Unsupported image');
  const image = await createImageBitmap(file);
  try {
    // Center-crop to 4:3 so the pet position on screen matches the exported image.
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 540;
    const ratio = 4 / 3;
    const sw = image.width / image.height > ratio ? image.height * ratio : image.width;
    const sh = sw / ratio;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 720, 540);
    ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, 720, 540);
    return canvas.toDataURL('image/jpeg', .72);
  } finally {
    image.close();
  }
}

async function addFiles(files) {
  if (!files.length || importingDrafts === drafts) return;
  const room = 6 - drafts.length;
  if (room <= 0) { notify('一次最多 6 張，先發布或移除幾張。'); return; }
  const target = drafts;
  const skipped = Math.max(0, files.length - room);
  const picked = [...files].slice(0, room);
  const added = [];
  let oversized = 0;
  let failed = 0;
  importingDrafts = target;
  recordMessage = '正在讀取照片…';
  render();
  for (const file of picked) {
    if (file.size > 15 * 1024 * 1024) { oversized += 1; continue; }
    try {
      const exif = file.type === 'image/jpeg' ? readExif(await file.slice(0, 256 * 1024).arrayBuffer()) : {};
      const src = await cropPhoto(file);
      const hadGps = exif.lat !== undefined;
      added.push({ ...draftDefaults(), src, takenAt: exif.takenAt ?? localStamp(file.lastModified || Date.now()),
        dateSource: exif.takenAt ? 'exif' : 'file', hadGps, candidates: hadGps ? nearbyPlaces(exif) : [] });
    } catch { failed += 1; }
    if (drafts !== target) return;
  }
  if (drafts !== target) return;
  const first = drafts.length;
  drafts.push(...added);
  importingDrafts = null;
  recordMessage = [
    added.length ? `已加入 ${added.length} 張照片` : '',
    oversized ? `${oversized} 張超過 15 MB` : '',
    failed ? `${failed} 張無法讀取，可改用 JPEG、PNG 或 WebP` : '',
    skipped ? `${skipped} 張超出 6 張上限` : '',
  ].filter(Boolean).join('。') + '。';
  if (page === 'record' && !selected) {
    render();
    if (added.length) focusDraftField(first, 'place');
    else view.querySelector('#photo-input')?.focus();
  }
}

function addSamples() {
  const first = drafts.length;
  const near = placeCoords.get('9');
  const stamp = localStamp(Date.now() - 2 * 3600 * 1000);
  drafts.push({ ...draftDefaults(), src: 'art:9', takenAt: stamp, dateSource: 'exif', hadGps: true, candidates: nearbyPlaces({ lat: near.lat + .0004, lng: near.lng - .0003 }) });
  drafts.push({ ...draftDefaults(), src: 'art:12', takenAt: localStamp(Date.now() - 26 * 3600 * 1000), dateSource: 'file', hadGps: false, candidates: [] });
  recordMessage = '已加入 2 張示範照片。';
  render();
  focusDraftField(first, 'place');
}

function publishDrafts() {
  if (!drafts.length || importingDrafts === drafts) return;
  const missing = drafts.findIndex(d => !restaurants.has(d.place) || !Number.isFinite(Date.parse(d.takenAt)));
  if (missing >= 0) {
    const placeMissing = !restaurants.has(drafts[missing].place);
    if (!placeMissing) {
      drafts[missing].extrasOpen = true;
      render();
    }
    const progress = view.querySelector('[data-record-progress]');
    progress.textContent = `第 ${missing + 1} 張照片${placeMissing ? '還沒選店家' : '需要確認時間'}`;
    focusDraftField(missing, placeMissing ? 'place' : 'takenAt')?.setAttribute('aria-invalid', 'true');
    return;
  }
  let social = state.social;
  try {
    for (const d of drafts) {
      social = photoTransition(social, { type: 'photo', place: d.place, takenAt: d.takenAt, src: d.src, caption: d.caption,
        audience: d.audience, with: d.with, pet: d.petOn ? d.pet : null });
    }
  } catch (err) { notify(err.message); return; }
  const count = drafts.length;
  const shared = drafts.filter(d => d.audience === 'friends').length;
  const growth = social.photos.slice(0, count).map(p => p.growth).find(g => g?.xp);
  const outcome = [shared ? `已與好友分享 ${shared} 張` : '', shared < count ? `已儲存 ${count - shared} 張私人紀錄` : ''].filter(Boolean).join('，');
  if (!save({ ...state, social }, outcome + (growth ? '，糰子 +' + growth.xp + ' XP' : '') + '。')) return;
  drafts = [];
  recordMessage = '';
  page = 'activity';
  previewPhoto = '';
  navigate();
  if (growth) {
    view.querySelector('.preview-content')?.insertAdjacentHTML('beforebegin', growthReceipt(growth));
    view.querySelector('.growth-receipt')?.focus({ preventScroll: true });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}

async function exportPhoto(id) {
  const p = state.social.photos.find(item => item.id === id);
  if (!p) return;
  const place = restaurants.get(p.place);
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 810;
  const ctx = canvas.getContext('2d');
  const image = photoSource(p.src);
  if (image) ctx.drawImage(await loadImage(image), 0, 0, 1080, 810);
  else {
    const art = restaurants.get(p.src.slice(4)) ?? place;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 810);
    gradient.addColorStop(0, ['#f6e7c8', '#f3d9c4', '#e5d7ea'][art.price - 1]);
    gradient.addColorStop(1, ['#e9c98f', '#e6a98a', '#c4b0d6'][art.price - 1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 810);
    ctx.font = '360px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(food[art.cuisine] ?? '🍽', 540, 405);
  }
  if (p.pet) {
    const size = p.pet.scale * 1080, x = p.pet.x * 1080, y = p.pet.y * 810;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = size + 'px serif'; ctx.fillText(p.pet.stage, x, y);
    ctx.font = size * .45 + 'px serif'; ctx.fillText(skins.find(item => item.id === p.pet.skin)?.icon ?? '', x + size * .38, y - size * .38);
  }
  ctx.fillStyle = '#ffffffd9'; ctx.fillRect(0, 730, 1080, 80);
  ctx.fillStyle = '#24543f'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(place.name + ' · ' + p.takenAt.slice(0, 10), 32, 770);
  ctx.textAlign = 'right'; ctx.fillText('Fomery', 1048, 770);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
  const file = new File([blob], 'fomery-' + place.name + '.jpg', { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: place.name }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('合照圖片已下載，可以分享到其他地方。');
}

function draftAt(el) {
  const index = Number(el.closest('[data-draft]')?.dataset.draft);
  return Number.isInteger(index) ? drafts[index] : null;
}

function placePet(handle, d) {
  handle.style.setProperty('--x', (d.pet.x * 100).toFixed(1) + '%');
  handle.style.setProperty('--y', (d.pet.y * 100).toFixed(1) + '%');
  handle.setAttribute('aria-valuetext', '水平 ' + Math.round(d.pet.x * 100) + '%，垂直 ' + Math.round(d.pet.y * 100) + '%');
}

let dragging = null;
document.addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-pet-handle]');
  if (!handle) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  dragging = { handle, draft: drafts[Number(handle.dataset.petHandle)], frame: handle.closest('[data-pet-frame]') };
});
document.addEventListener('pointermove', event => {
  if (!dragging) return;
  const rect = dragging.frame.getBoundingClientRect();
  dragging.draft.pet.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  dragging.draft.pet.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  placePet(dragging.handle, dragging.draft);
});
document.addEventListener('pointerup', () => { dragging = null; });
document.addEventListener('pointercancel', () => { dragging = null; });
document.addEventListener('keydown', event => {
  const handle = event.target.closest?.('[data-pet-handle]');
  const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!handle || !move) return;
  event.preventDefault();
  const d = drafts[Number(handle.dataset.petHandle)];
  d.pet.x = Math.min(1, Math.max(0, d.pet.x + move[0] * .03));
  d.pet.y = Math.min(1, Math.max(0, d.pet.y + move[1] * .03));
  placePet(handle, d);
});

function openRating(id) {
  ratingId = id;
  ratingSession += 1;
  draft = null;
  error.textContent = '';
  form.reset();
  const existing = state.ranked.find(row => row.id === id);
  if (existing) {
    form.elements.mood.value = existing.mood;
    for (const name of ['companions', 'dish', 'date', 'note']) form.elements[name].value = existing[name] ?? '';
    form.elements.tags.value = existing.tags.join('、');
    form.elements.hiddenFromActivity.checked = Boolean(existing.hiddenFromActivity);
  }
  fields.hidden = false;
  comparison.hidden = true;
  extras.open = Boolean(form.elements.mood.value);
  for (const field of extras.querySelectorAll('details')) field.open = false;
  extras.hidden = submit.disabled = !form.elements.mood.value;
  document.querySelector('#dialog-title').textContent = restaurants.get(id).name;
  const place = restaurants.get(id);
  document.querySelector('#dialog-meta').textContent = '＄'.repeat(place.price) + ' · ' + place.cuisine + ' · ' + place.district;
  dialog.showModal();
}

async function thumbnail(file) {
  if (!file.size) return '';
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('請選擇 10 MB 以內的圖片。');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 540 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .72);
  } finally {
    image.close();
  }
}

function nextComparison() {
  const pair = opponent(draft);
  if (pair) {
    fields.hidden = true;
    comparison.hidden = false;
    document.querySelector('#comparison-mood').innerHTML = moods.map(mood =>
      '<span class="mini-choice mood-' + mood + (mood === draft.entry.mood ? ' chosen' : '') + '">'
      + '<span class="mood-circle" aria-hidden="true">' + (mood === draft.entry.mood ? '✓' : '') + '</span>'
      + '<small>' + labels[mood] + (mood === draft.entry.mood ? '（已選）' : '') + '</small></span>').join('');
    comparison.querySelector('.pair').innerHTML = '<button type="button" data-choice="new" aria-label="' + escape(draft.entry.name) + '">'
      + escape(draft.entry.name) + '<small>' + escape(draft.entry.district) + '</small></button><button type="button" data-choice="existing" aria-label="' + escape(pair.name) + '">'
      + escape(pair.name) + '<small>' + escape(pair.district) + '</small></button>';
    document.querySelector('#comparison-info').innerHTML = [draft.entry, pair].map(place =>
      '<p><strong>' + escape(place.name) + '</strong><br>' + escape(place.city) + ' · ' + escape(place.district)
      + ' · ' + escape(place.cuisine) + ' · ' + '＄'.repeat(place.price) + '</p>').join('');
    comparison.querySelector('details').open = false;
    document.querySelector('#compare-title').focus();
    return;
  }
  const ranked = finishRanking(draft);
  const result = ranked.find(entry => entry.id === ratingId);
  const rank = ranked.findIndex(entry => entry.value === result.value) + 1;
  if (!save({ ...state, ranked, saved: state.saved.filter(id => id !== ratingId) },
    result.name + '已加入吃過 · 第 ' + rank + ' 名')) return;
  dialog.close();
  selected = ratingId;
  navigate();
}

document.addEventListener('input', event => {
  const field = event.target.dataset?.draftField;
  if (field && ['takenAt', 'caption', 'petScale'].includes(field)) {
    const d = draftAt(event.target);
    if (!d) return;
    if (field === 'petScale') {
      d.pet.scale = Number(event.target.value) / 100;
      event.target.closest('[data-draft]').querySelector('[data-pet-handle]')?.style.setProperty('--s', d.pet.scale);
    } else {
      d[field] = event.target.value;
      if (field === 'takenAt') {
        event.target.removeAttribute('aria-invalid');
        view.querySelector('[data-record-progress]').textContent = recordProgress(drafts);
      }
    }
    return;
  }
  if (event.target.id === 'map-query') {
    mapQuery = event.target.value;
    const link = document.querySelector('#map-directions');
    if (mapQuery.trim()) {
      link.href = mapsUrl(mapQuery, 'directions');
      link.textContent = '規劃前往此地的路線 ↗';
      link.removeAttribute('aria-disabled');
    } else {
      link.removeAttribute('href'); link.setAttribute('aria-disabled','true');
    }
  } else if (event.target.id === 'search') {
    query = event.target.value;
    drawResults();
  } else if (event.target.name === 'mood') {
    extras.hidden = submit.disabled = false;
    extras.open = true;
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'demo-actor') {
    drafts = [];
    importingDrafts = null;
    recordMessage = '';
    applySocial({ type: 'actor', id: event.target.value });
    return;
  }
  if (event.target.id === 'photo-input') {
    addFiles(event.target.files);
    return;
  }
  const field = event.target.dataset?.draftField;
  const withId = event.target.dataset?.draftWith;
  if (field || withId) {
    const d = draftAt(event.target);
    if (!d) return;
    if (withId) d.with = event.target.checked ? [...d.with, withId] : d.with.filter(id => id !== withId);
    else if (field === 'place') d.place = event.target.value;
    else if (field === 'audience') d.audience = event.target.value;
    else if (field === 'petOn') d.petOn = event.target.checked;
    else return;
    if (field === 'place' || field === 'petOn') {
      const index = drafts.indexOf(d);
      render();
      focusDraftField(index, field);
    }
    return;
  }
  const key = event.target.dataset.filter;
  if (!Object.hasOwn(filters, key)) return;
  filters[key] = event.target.value;
  render();
  document.querySelector('[data-filter="' + key + '"]').focus();
});

document.addEventListener('toggle', event => {
  if (!event.target.isConnected || !event.target.matches?.('[data-draft-extras]')) return;
  const draft = draftAt(event.target);
  if (draft) draft.extrasOpen = event.target.open;
}, true);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(form);
  const id = ratingId;
  const session = ratingSession;
  const photo = values.get('photo');
  error.textContent = '';
  submit.disabled = true;
  try {
    const image = photo?.size ? await thumbnail(photo) : state.ranked.find(row => row.id === id)?.photo;
    if (!dialog.open || ratingSession !== session) return;
    draft = beginRanking(state.ranked, {
      ...restaurants.get(id), mood: values.get('mood'), photo: image,
      companions: values.get('companions').trim(), dish: values.get('dish').trim(),
      tags: [...new Set(values.get('tags').split(/[、,，]/).map(tag => tag.trim()).filter(Boolean))],
      date: values.get('date'), note: values.get('note').trim(), ratedAt: Date.now(),
      hiddenFromActivity: values.has('hiddenFromActivity'),
    });
    nextComparison();
  } catch {
    if (dialog.open && ratingSession === session) {
      error.textContent = '照片無法讀取。請選擇 10 MB 以內的 JPEG、PNG 或 WebP，或略過照片。';
    }
  } finally {
    if (dialog.open && ratingSession === session) submit.disabled = false;
  }
});

function navigate() {
  render();
  const title = document.querySelector('#view-title');
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function applySocial(action) {
  try {
    const social = photoTypes.has(action.type) ? photoTransition(state.social, action) : transition(state.social, action);
    let next = { ...state, social };
    if (action.type === 'react') {
      const p = social.photos.find(item => item.id === action.id);
      const wants = p.reactions.some(r => r.actor === social.actor && r.kind === 'want');
      // The saved list belongs to the main demo user, so only "you" syncs it.
      if (action.kind === 'want' && wants && social.actor === 'you' && !state.saved.includes(p.place)) next = { ...next, saved: [...state.saved, p.place] };
      const name = restaurants.get(p.place).name;
      const host = p.actor === 'you' ? '「你」' : people[p.actor];
      const notes = { want: wants ? '已加入想吃' + (social.actor === 'you' ? '，也存進想去清單' : '') + '。' : '已取消想吃。',
        together: '已約 ' + host + ' 下週六一起去' + name + '，切換成 ' + host + ' 就能回覆。' };
      if (save(next, notes[action.kind])) render();
      return;
    }
    if (action.type === 'joinEvent' && page === 'activity') {
      if (save(next, '已確認赴約！到聚餐頁看看還有誰。')) render();
      return;
    }
    const messages = { deletePhoto: '照片已刪除。', message: '訊息已送出。', petPlay: '兩隻糰子開心地一起玩！雙方各獲得 5 XP。', request: '好友邀請已送出，切換對方角色接受。', accept: '已成為好友！', joinGroup: '已加入群組。', createEvent: '聚餐已建立，可以開始邀請朋友。', invite: '邀請已送出，等待朋友回覆。', joinEvent: '報名成功，餐桌上有你的位子！', leaveEvent: '已退出聚餐。', post: '貼文已發布，寵物成長與金幣已更新。', skin: '造型已穿戴！', nextDay: '已模擬隔天，可以再次發文領取獎勵。', actor: '已切換示範角色（餐廳排行仍為原本的個人展示資料）。' };
    if (save({ ...state, social }, messages[action.type])) {
      render();
      if (action.type === 'post') {
        const anchor = view.querySelector('.role-bar');
        if (anchor) {
          anchor.insertAdjacentHTML('afterend', growthReceipt(social.posts[0].growth));
          const receipt = view.querySelector('.growth-receipt');
          receipt.focus({ preventScroll:true });
          receipt.scrollIntoView({ block:'center' });
        }
      } else if (action.type === 'message') {
        const chat = [...view.querySelectorAll('[data-chat-group]')].find(el => el.dataset.chatGroup === action.group);
        if (chat) {
          const log = chat.querySelector('.chat-history'); log.scrollTop = log.scrollHeight;
          chat.querySelector('[name="text"]').focus({ preventScroll:true });
        }
      }
    }
  } catch (err) { notify(err.message); }
}

document.addEventListener('submit', event => {
  if (event.target.id === 'maps-form' && !mapQuery.trim()) {
    event.preventDefault(); notify('請輸入地點或地址。'); return;
  }
  const type = event.target.dataset.socialForm;
  if (!type) return;
  event.preventDefault();
  applySocial({ ...Object.fromEntries(new FormData(event.target)), type });
});

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (data.dismissGrowth !== undefined) {
    button.closest('.growth-receipt').remove();
  } else if (previewUi && data.uiPhoto !== undefined) {
    previewPhoto = data.uiPhoto;
    navigate();
  } else if (data.draftRemove !== undefined) {
    const index = Number(data.draftRemove);
    drafts.splice(index, 1);
    render();
    if (drafts.length) focusDraftField(Math.min(index, drafts.length - 1), 'place');
    else view.querySelector('#photo-input')?.focus();
  } else if (data.recordSample !== undefined) {
    if (importingDrafts === drafts) return;
    if (drafts.length > 4) notify('一次最多 6 張，先發布或移除幾張。');
    else addSamples();
  } else if (data.recordPublish !== undefined) {
    publishDrafts();
  } else if (data.photoReact) {
    applySocial({ type: 'react', id: data.id, kind: data.photoReact });
  } else if (data.photoDelete) {
    if (window.confirm('刪除這張照片？朋友也將看不到它。')) applySocial({ type: 'deletePhoto', id: data.photoDelete });
  } else if (data.photoExport) {
    exportPhoto(data.photoExport).catch(() => notify('圖片產生失敗，請再試一次。'));
  } else if (data.mapScope) {
    mapScope = data.mapScope; mapFocus = '';
    render();
  } else if (data.mapPlace !== undefined) {
    mapFocus = mapFocus === data.mapPlace ? '' : data.mapPlace;
    render();
    view.querySelector('.photo-map + .section-heading')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (data.social) {
    applySocial({ type: data.social, id: data.id, target: data.target });
  } else if (data.reset !== undefined) {
    if (!window.confirm('還原全部展示資料？將重設照片、評價、收藏、好友、群組、聚餐、貼文與寵物。原版紀錄不受影響。')) return;
    if (!save({ ...createDemoState(), social: freshSocial() }, '展示資料已還原，可以開始下一輪 Demo。')) return;
    drafts = []; importingDrafts = null; recordMessage = ''; mapScope = 'friends'; mapFocus = '';
    previewPhoto = '';
    query = ''; selected = null; page = 'activity'; listMap = false; tourStep = 0;
    Object.keys(filters).forEach(key => { filters[key] = ''; });
    navigate();
  } else if (data.close !== undefined) dialog.close();
  else if (data.choice) {
    if (data.choice === 'undo' && !draft.history.length) {
      comparison.hidden = true;
      fields.hidden = false;
      submit.focus();
    } else {
      draft = compare(draft, data.choice);
      nextComparison();
    }
  } else if (data.rate) openRating(data.rate);
  else if (data.detail) {
    selected = data.detail;
    if (page === 'search') save({ ...state, recent: [selected, ...state.recent.filter(id => id !== selected)].slice(0, 4) });
    navigate();
  } else if (data.bookmark) {
    const id = data.bookmark;
    const saved = state.saved.includes(id) ? state.saved.filter(value => value !== id) : [...state.saved, id];
    if (save({ ...state, saved }, saved.includes(id) ? '已存為想去' : '已移除收藏')) render();
  } else if (data.listView) {
    listMap = data.listView === 'map';
    render();
  } else if (data.tourStep) {
    tourStep = Math.max(0, Math.min(tour.length - 1, tourStep + Number(data.tourStep)));
    navigate();
  } else if (data.next !== undefined) {
    query = '';
    page = 'search';
    selected = null;
    navigate();
  } else if (data.page || data.back !== undefined) {
    if (data.page) {
      page = data.page;
      previewPhoto = '';
    }
    if (page === 'tour') tourStep = 0;
    selected = null;
    navigate();
  }
});

render();
