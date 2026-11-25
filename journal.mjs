import { findPlaces, googleExploreEmbedUrl, mapSearchLinks, suggestPlaces } from './maps.mjs?v=record-2';
import { groupMeals, localDate, mealDateFromPhotos, mealPhotoLimit, monthDates, sampleMeals, shiftDay } from './journal-data.mjs?v=friends-feed-1';
import { mealCard, photoEdgeTint, preparePhoto, sharePhoto } from './journal-media.mjs?v=friends-feed-1';
import { mealReader } from './meal-reader.mjs?v=friends-feed-2';
import { qrcode } from './vendor/qrcode.mjs';

const view = document.querySelector('#view');
const status = document.querySelector('#status');
const login = document.querySelector('#login');
const detail = document.querySelector('#meal-detail');
const detailBody = document.querySelector('#detail-body');
const photoSheet = document.querySelector('#photo-sheet');
const pickerPhotos = photoSheet.querySelector('[data-picker-photos]');
const pickerNext = photoSheet.querySelector('[data-finish-photos]');
const pickerStatus = photoSheet.querySelector('[data-picker-status]');
const pages = ['feed', 'friends', 'record', 'explore', 'profile'];
const friendCode = /^[a-f0-9]{12}$/;
const coverFields = 'id,owner,restaurant,caption,eaten_on,eaten_time,created_at,photo,place_id';
const sample = sampleMeals();
const config = await fetch('./journal-config.json', { cache: 'no-store' }).then(response => response.json()).catch(() => ({}));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const commentDrafts = new Map();
const openMealReader = mealReader(detail, detailBody, { render: meal => mealDetails(meal, true), activate: loadStory, reducedMotion });
let client;
let session;
let diner;
let friends = [];
let feed = [];
let personal = [];
let found;
let saving = false;
let updating = 0;
let authenticating = 0;
let suggestionTimer;
let suggesting = 0;
let draft = {};
let month = localDate().slice(0, 7);
const url = new URL(location.href);
const invite = url.searchParams.get('invite') || sessionStorage.getItem('fomery-invite');
const entry = friendCode.test(invite || '') ? invite : '';
if (entry) sessionStorage.setItem('fomery-invite', entry);
const base = new URL('./', url);
let searchCode = entry;
let page = entry ? 'friends' : 'feed';
let recordReturn = page;
let editingPhotos = false;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const title = (text, actions = '') => '<div class="view-heading"><h2 id="view-title" tabindex="-1">' + text + '</h2>' + actions + '</div>';
const checked = ({ data, error }) => { if (error) throw error; return data; };

function notice(message = '', error = false) {
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('error', error);
}

function nameFor(id) {
  if (id === diner?.id) return diner.nickname;
  return friends.find(row => row.sender === id || row.recipient === id)
    ?.other?.nickname ?? id;
}

function photo(meal, label, className = '', lazy = false) {
  const src = meal.id.startsWith('sample-') || /^data:image\/jpeg;base64,[a-z0-9+/]+={0,2}$/i.test(meal.photo)
    ? meal.photo : '';
  return '<img class="' + className + '" src="' + escape(src) + '" alt="' + escape(label) + '"' + (lazy ? ' loading="lazy"' : '') + '>';
}

function tile(meal) {
  return '<button class="tile" type="button" data-meal="' + escape(meal.id) + '">' + photo(meal, '', '', true)
    + '<strong>' + escape(meal.restaurant) + '</strong>' + (meal.caption ? '<small>' + escape(meal.caption) + '</small>' : '') + '</button>';
}

function feedPage() {
  const meals = diner ? feed : sample.filter(meal => meal.owner !== '你');
  const rows = [...groupMeals(meals, 'owner')].map(([owner, items]) => {
    const row = escape(nameFor(owner));
    const arrows = items.length > 2 ? '<div class="feed-arrows"><button type="button" data-shift-row="-1" aria-label="較新的餐" disabled>‹</button><button type="button" data-shift-row="1" aria-label="較早的餐">›</button></div>' : '';
    return `<section class="friend-row" aria-label="${row} 的近況"><header><h3>${row}</h3>${arrows}</header><div class="tile-grid">${items.map(tile).join('')}</div></section>`;
  });
  const action = diner ? '<button type="button" data-refresh aria-label="更新動態"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 5v5h-5M20 10a8 8 0 1 0 0 5"/></svg></button>' : '';
  return title('朋友近況', action) + (rows.length ? rows.join('') : '<p>好友最近七天還沒有貼文。</p><button type="button" data-page="friends">去加好友</button>');
}

function profilePage() {
  const meals = diner ? personal : sample.filter(meal => meal.owner === '你');
  const { blanks, days } = monthDates(month);
  const byDay = groupMeals(meals, 'eaten_on');
  const today = localDate();
  const cells = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = month + '-' + String(day).padStart(2, '0');
    const daily = byDay.get(date) || [];
    const classes = 'day' + (daily.length > 1 ? ' double' : '') + (date === today ? ' today' : '');
    const number = '<span class="day-number">' + day + '</span>';
    if (!daily.length) return '<div class="' + classes + '">' + number + '</div>';
    return '<button type="button" class="' + classes + '" data-day="' + date + '" aria-label="' + date + '，' + daily.length + ' 餐">'
      + number + daily.slice(0, 2).map(meal => photo(meal, '', '', true)).join('')
      + (daily.length > 2 ? '<span class="day-more">＋' + (daily.length - 2) + '</span>' : '') + '</button>';
  });
  const weekdays = [...'一二三四五六日'].map(day => '<span class="day-label">' + day + '</span>').join('');
  const account = diner ? '<p class="muted">' + escape(diner.nickname) + '</p>' : '';
  const dark = document.documentElement.dataset.theme === 'dark';
  const appearance = `<div class="appearance-switch" role="group" aria-label="外觀">
    <button type="button" data-theme="light" aria-pressed="${!dark}">淺色</button>
    <button type="button" data-theme="dark" aria-pressed="${dark}">深色</button>
  </div>`;
  const refreshButton = diner ? '<button type="button" data-refresh>更新</button>' : '';
  return title('個人', '<div class="profile-actions">' + appearance + refreshButton + '</div>') + account
    + '<section class="month" aria-label="用餐月曆"><header class="month-header">'
    + '<button type="button" data-month="-1" aria-label="上個月">‹</button><h3>' + month.replace('-', ' 年 ') + ' 月</h3>'
    + '<button type="button" data-month="1" aria-label="下個月">›</button></header>'
    + '<div class="calendar">' + weekdays + '<span aria-hidden="true"></span>'.repeat(blanks) + cells.join('') + '</div></section>'
    + (diner ? '<button type="button" data-sign-out>登出</button>' : '<p class="muted">登入後，用這張月曆回看自己的餐照。</p>');
}

function person(row) {
  const outgoing = row.sender === diner.id;
  const action = row.accepted ? '移除' : outgoing ? '撤回' : '拒絕';
  const key = row.sender + '/' + row.recipient;
  const receive = !row.accepted && !outgoing ? '<button type="button" class="primary" data-accept="' + key + '">接受</button>' : '';
  return '<div class="person"><div><strong>' + escape(row.other.nickname) + '</strong><br><small>'
    + (row.accepted ? row.other.friend_id : outgoing ? '等待對方接受' : '好友申請') + '</small></div><div class="controls">'
    + receive + '<button type="button" data-remove="' + key + '">' + action + '</button></div></div>';
}

function inviteLink() {
  const link = new URL(base);
  link.searchParams.set('invite', diner.friend_id);
  return link.href;
}

function friendsPage() {
  if (!diner) {
    const names = [...groupMeals(sample.filter(meal => meal.owner !== '你'), 'owner').keys()];
    return title('好友', '<small>示範好友</small>')
      + '<p>登入後可用好友 ID、邀請連結或 QR Code 加好友。</p>'
      + '<div class="panel"><h3>我的好友</h3>'
      + names.map(name => '<div class="person"><strong>' + escape(name) + '</strong></div>').join('') + '</div>';
  }
  const qr = qrcode(0, 'M');
  qr.addData(inviteLink(), 'Byte');
  qr.make();
  const pending = friends.filter(row => !row.accepted);
  const accepted = friends.filter(row => row.accepted);
  const thisPair = found && friends.some(row => row.other.id === found.id);
  const send = found && found.id !== diner.id && !thisPair
    ? '<button type="button" class="primary" data-request>送出好友申請</button>' : '';
  return title('好友', '<button type="button" data-refresh>更新</button>')
    + '<div class="panel"><strong>我的好友 ID</strong> <code>' + escape(diner.friend_id) + '</code>'
    + '<div class="controls"><button type="button" data-copy-id>複製 ID</button><button type="button" data-share>分享邀請連結</button></div>'
    + '<details class="qr"><summary>邀請 QR Code</summary><img alt="掃描 QR Code 開啟好友邀請" src="' + qr.createDataURL(4, 16) + '"></details></div>'
    + '<form class="fields panel" data-find><label>加好友<input name="code" inputmode="text" maxlength="12" required placeholder="輸入好友 ID" value="' + escape(searchCode) + '"></label>'
    + '<div><button type="submit">找好友</button></div></form>'
    + (found ? '<div class="person panel"><strong>' + escape(found.nickname) + '</strong>' + send + '</div>' : '')
    + (pending.length ? '<div class="panel"><h3>好友申請</h3>' + pending.map(person).join('') + '</div>' : '')
    + '<div class="panel"><h3>我的好友</h3>' + (accepted.length ? accepted.map(person).join('') : '<p class="muted">還沒有好友。</p>') + '</div>';
}

function pickerTiles() {
  const photos = draft.photos || [];
  return photos.map((item, index) => `<figure class="draft-tile">
    <button type="button" class="cover-choice" data-pick-cover="${index}" aria-label="第 ${index + 1} 張照片設為首圖" aria-pressed="${index === 0}"><img src="${item.src}" alt=""></button>
    <button type="button" class="drop-photo" data-drop-photo="${index}" aria-label="移除第 ${index + 1} 張照片">×</button>
    ${index === 0 ? '<figcaption>首圖</figcaption>' : ''}
    ${item.original ? `<button type="button" class="save-photo" data-save-photo="${index}">儲存原圖</button>` : ''}
  </figure>`).join('');
}

function recordPhotoSummary() {
  const photos = draft.photos || [];
  const hint = dateHint();
  return `<button type="button" class="record-photo-summary" data-edit-photos>
    ${photos.length ? `<span class="record-photo-thumbs">${photos.slice(0, 3).map(item => `<img src="${item.src}" alt="">`).join('')}</span>` : ''}
    <span><strong>${photos.length ? '編輯照片' : '新增照片'}</strong>${hint ? `<small>${escape(hint)}</small>` : ''}</span>
  </button>`;
}

function dateHint() {
  const date = mealDateFromPhotos(draft.photos);
  if (!date) return '';
  const time = date.day.replaceAll('-', '/') + ' ' + date.time.slice(0, 5);
  const source = { photo: '首圖拍攝時間', file: '首圖檔案時間', added: '加入首圖的時間' }[date.source];
  return `${source} · ${time}`;
}

function selectedPlace() {
  const place = draft.place;
  return place ? `<div class="chosen-place">
    <strong>${escape(place.displayName)}</strong>
    <button type="button" data-clear-place aria-label="清除連結店家">×</button>
    <span class="map-attribution" translate="no">Google Maps</span>
  </div>` : '';
}

function recordPage() {
  return title('記錄一餐', '<button type="button" data-close-record aria-label="關閉記錄">×</button>') + `<form class="fields" data-record ${saving ? 'inert' : ''}>
    <div data-record-photos>${recordPhotoSummary()}</div>
    <div class="restaurant-field">
      <label>用餐店家<input name="restaurant" maxlength="100" autocomplete="off" required placeholder="輸入店名" value="${escape(draft.restaurant)}"></label>
      <div data-restaurant-suggestions hidden></div>
      <span class="visually-hidden" data-restaurant-status role="status"></span>
      <div data-chosen-place ${draft.place ? '' : 'hidden'}>${selectedPlace()}</div>
    </div>
    <label class="record-notes">心得<textarea name="caption" rows="3" maxlength="280" placeholder="這餐怎麼樣？">${escape(draft.caption)}</textarea></label>
    <div class="controls"><button type="submit" class="primary" ${diner && draft.photos?.length && !draft.reading ? '' : 'disabled'}>${diner ? '發布給好友' : '登入後發布'}</button></div></form>`;
}

function explorePage() {
  return title('探索')
    + '<form class="fields" data-explore><label>找店<input name="query" required maxlength="180" placeholder="輸入店名、地址或地區"></label>'
    + '<div><button type="submit" class="primary">' + (config.mapsKey ? '找店' : '在 Google 地圖找店 ↗') + '</button></div>'
    + '<div data-place-results hidden></div></form>'
    + '<iframe class="explore-map" title="地圖" loading="lazy" referrerpolicy="no-referrer" src="' + escape(googleExploreEmbedUrl) + '"></iframe>';
}

async function mealCovers(owner, activePage, first, end) {
  const rows = [];
  const batch = 100;
  for (let start = 0; ; start += batch) {
    let query = client.from('meals').select(coverFields).gte('eaten_on', first).lte('eaten_on', end);
    query = activePage === 'feed' ? query.neq('owner', owner) : query.eq('owner', owner);
    const chunk = checked(await query.order('eaten_on', { ascending: false })
      .order('eaten_time', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      .order('id').range(start, start + batch - 1));
    rows.push(...chunk);
    if (chunk.length < batch) return [...new Map(rows.map(meal => [meal.id, meal])).values()];
  }
}

function render(focus = false) {
  login.hidden = !!session || !client;
  for (const button of document.querySelectorAll('nav button')) {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  view.ariaBusy = 'false';
  if (session && !diner) {
    view.innerHTML = title('建立個人資料') + '<form data-profile class="fields"><label>顯示暱稱<input name="nickname" maxlength="32" required autocomplete="nickname"></label><div><button type="submit" class="primary">繼續</button></div></form>';
  } else {
    view.innerHTML = { feed: feedPage, friends: friendsPage, record: recordPage, explore: explorePage, profile: profilePage }[page]();
  }
  if (focus) view.querySelector('h2').focus();
}

async function refresh() {
  const turn = ++updating;
  if (!diner) return;
  const owner = diner.id;
  const activePage = page;
  if (activePage === 'friends' || activePage === 'feed') {
    const [rows, meals] = await Promise.all([
      client.from('friend_requests').select('*,sender_info:diners!friend_requests_sender_fkey(*),recipient_info:diners!friend_requests_recipient_fkey(*)'),
      activePage === 'feed' ? mealCovers(owner, 'feed', shiftDay(localDate(), -6), localDate()) : [],
    ]);
    if (updating !== turn) return;
    friends = checked(rows).map(row => ({ ...row, other: row.sender === owner ? row.recipient_info : row.sender_info }));
    if (activePage === 'feed') feed = meals;
  }
  if (activePage === 'profile') {
    const { first, next } = monthDates(month);
    const result = await mealCovers(owner, 'profile', first, shiftDay(next, -1));
    if (updating === turn) personal = result;
  }
  return updating === turn && ['feed', 'friends', 'profile'].includes(activePage);
}

async function find(code) {
  searchCode = code.trim().toLowerCase();
  if (!friendCode.test(searchCode)) {
    found = undefined;
    render();
    return notice('請輸入 12 碼好友 ID。', true);
  }
  const result = checked(await client.rpc('find_diner', { code: searchCode }).maybeSingle());
  if (page !== 'friends' || !diner) return;
  found = result;
  if (!found) notice('找不到這個好友 ID。', true);
  render();
}

async function openInvite() {
  if (!diner || !entry || page !== 'friends' || !sessionStorage.getItem('fomery-invite')) return;
  await find(entry);
  sessionStorage.removeItem('fomery-invite');
  history.replaceState(null, '', base);
}

async function initialize(nextSession) {
  const turn = ++authenticating;
  ++updating;
  session = nextSession;
  diner = undefined;
  friends = [];
  feed = [];
  personal = [];
  found = undefined;
  draft = {};
  commentDrafts.clear();
  if (photoSheet.open) photoSheet.close();
  if (detail.open) detail.close();
  detailBody.replaceChildren();
  if (session) {
    const profile = await client.from('diners').select('*').eq('id', session.user.id).maybeSingle();
    if (turn !== authenticating) return;
    diner = checked(profile);
    await refresh();
    if (turn !== authenticating) return;
    await openInvite();
  }
  render();
}

function paintRecordPhotos(revealNewest = false) {
  const photos = draft.photos || [];
  pickerPhotos.innerHTML = pickerTiles();
  pickerPhotos.hidden = photos.length === 0;
  if (revealNewest) pickerPhotos.scrollLeft = pickerPhotos.scrollWidth;
  const count = photoSheet.querySelector('[data-photo-count]');
  count.textContent = `${photos.length} / ${mealPhotoLimit}`;
  count.hidden = photos.length === 0;
  pickerNext.disabled = !photos.length || !!draft.reading || saving;
  for (const button of photoSheet.querySelectorAll('[data-select-photo]')) button.disabled = !!draft.reading || photos.length >= mealPhotoLimit;
  for (const button of photoSheet.querySelectorAll('[data-drop-photo], [data-pick-cover]')) button.disabled = !!draft.reading;
  const form = view.querySelector('[data-record]');
  if (!form) return;
  form.querySelector('[data-record-photos]').innerHTML = recordPhotoSummary();
  form.querySelector('[type="submit"]').disabled = !diner || !photos.length || !!draft.reading || saving;
}

function pickerNotice(message = '', error = false) {
  pickerStatus.textContent = message;
  pickerStatus.hidden = !message;
  pickerStatus.classList.toggle('error', error);
}

function goToPage(next) {
  page = next;
  notice();
  render(true);
  window.scrollTo(0, 0);
  void action(async () => { if (await refresh()) render(true); }, '載入失敗，請稍後再試。');
}

function openPhotoSheet(editing = false) {
  if (saving || photoSheet.open || !view.querySelector('[data-record]')) return;
  editingPhotos = editing;
  pickerNext.textContent = editing ? '完成' : '下一步';
  pickerNotice(draft.reading ? '照片處理中…' : '');
  paintRecordPhotos();
  photoSheet.showModal();
  photoSheet.scrollTop = 0;
  photoSheet.querySelector('[data-select-photo="photo"]:enabled')?.focus({ preventScroll: true });
}

function finishPhotoSheet() {
  if (!photoSheet.open || pickerNext.disabled) return;
  const form = view.querySelector('[data-record]');
  photoSheet.close();
  if (!form) return;
  const focus = editingPhotos ? form.querySelector('[data-edit-photos]') : form.elements.restaurant;
  focus.focus({ preventScroll: true });
  if (!reducedMotion.matches) form.animate([
    { opacity: .32, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

function discardRecord() {
  if (saving) return false;
  const hasContent = draft.reading || draft.photos?.length || draft.restaurant?.trim() || draft.caption?.trim();
  if (hasContent && !confirm('捨棄這餐的草稿？')) return false;
  draft = {};
  if (photoSheet.open) photoSheet.close();
  return true;
}

function changeCover(index) {
  const photos = draft.photos;
  if (!index || !photos?.[index] || draft.reading) return;
  const start = reducedMotion.matches ? [] : [...pickerPhotos.children].map(tile => tile.getBoundingClientRect().left);
  photos.unshift(photos.splice(index, 1)[0]);
  paintRecordPhotos();
  pickerPhotos.scrollLeft = 0;
  for (const [newIndex, tile] of [...pickerPhotos.children].entries()) {
    if (!start.length) break;
    const oldIndex = newIndex === 0 ? index : newIndex <= index ? newIndex - 1 : newIndex;
    const shift = start[oldIndex] - tile.getBoundingClientRect().left;
    if (Math.abs(shift) > 1) tile.animate([
      { transform: `translateX(${shift}px) scale(.96)` }, { transform: 'translateX(0) scale(1)' },
    ], { duration: 390, easing: 'cubic-bezier(.18,.88,.22,1)' });
  }
  pickerPhotos.querySelector('[data-pick-cover="0"]').focus({ preventScroll: true });
  pickerNotice();
}

function galleryImages(meal, photos, offset = 0) {
  return photos.map((src, index) => `<figure><div class="photo-matte">${photo({ ...meal, photo: src }, `餐照 ${offset + index + 1}`, 'detail-photo', index > 0 || offset > 0)}</div></figure>`).join('');
}

function fitGalleryPhoto(image) {
  const frame = image.closest('figure');
  if (!image.naturalWidth || frame.dataset.ratio) return;
  const ratio = image.naturalWidth / image.naturalHeight;
  frame.dataset.ratio = ratio <= 1 ? ratio : 4 / 5;
  frame.toggleAttribute('data-portrait', ratio <= 1);
  frame.style.setProperty('--frame-ratio', frame.dataset.ratio);
  frame.style.setProperty('--photo-edge', photoEdgeTint(image));
}

function showGalleryCount(track) {
  const total = track.children.length;
  const index = Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / track.clientWidth) || 0));
  const controls = track.nextElementSibling;
  controls.hidden = total < 2;
  const caption = `${index + 1} / ${total}`;
  const counter = controls.querySelector('output');
  if (counter.textContent !== caption) counter.textContent = caption;
  if (!track.closest('.reader-page')) {
    controls.querySelector('[data-slide="-1"]').disabled = index === 0;
    controls.querySelector('[data-slide="1"]').disabled = index === total - 1;
    return;
  }
  track.tabIndex = total > 1 ? 0 : -1;
  const frame = track.children[index];
  fitGalleryPhoto(frame.querySelector('img'));
  if (!frame.dataset.ratio) return;
  track.style.setProperty('--frame-ratio', frame.dataset.ratio);
  track.toggleAttribute('data-portrait', frame.hasAttribute('data-portrait'));
}

const storyIcons = {
  heart: '<path d="M20.7 5.1a4.8 4.8 0 0 0-6.8 0L12 7l-1.9-1.9a4.8 4.8 0 0 0-6.8 6.8L12 20.5l8.7-8.6a4.8 4.8 0 0 0 0-6.8Z"/>',
  comment: '<path d="M21 11.5a8.1 8.1 0 0 1-8.1 8.1H5l1.6-3.6a8.1 8.1 0 1 1 14.4-4.5Z"/>',
  share: '<path d="m3 10 18-7-7 18-3-8-8-3Zm8 3L21 3"/>',
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
};
const storyIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${storyIcons[name]}</svg>`;
const demoComments = {
  'sample-1': ['這看起來好香。', '蛋拌進去之後，湯變得好濃。', '這鍋幾個人吃剛好？', '兩個人剛好，再加一碗飯。', '好，下次一起去。', '可以。'],
  'sample-7': ['烤餅看起來好香，下次一起去。'],
};

function mealDetails(meal, immersive = false) {
  const own = meal.owner === (diner?.id ?? '你');
  const photos = [meal.photo, ...(meal.extra_photos || [])];
  const examples = !diner && immersive ? demoComments[meal.id] ?? [] : [];
  const commentCount = examples.length;
  const showComposer = diner || immersive;
  const form = showComposer ? `<form class="comment-form" data-comment>
    <input name="message" aria-label="寫留言" placeholder="留言" maxlength="280" value="${escape(commentDrafts.get(meal.id))}" required ${diner ? '' : 'disabled'}>
    <button type="submit" aria-label="送出留言" ${diner ? '' : 'disabled'}>${storyIcon('send')}</button>
  </form>` : '';
  const photoCount = `<output aria-live="polite">1 / ${photos.length}</output>`;
  return `<article class="meal-story" data-meal-story="${escape(meal.id)}"><div class="story-content">
    <div class="story-gallery">
    <div class="gallery-track" role="region" aria-label="這餐的照片">${galleryImages(meal, photos)}</div>
    <div class="gallery-controls" ${photos.length > 1 ? '' : 'hidden'}>
      ${immersive ? photoCount : `
        <button type="button" data-slide="-1" aria-label="上一張">‹</button>
        ${photoCount}
        <button type="button" data-slide="1" aria-label="下一張">›</button>`}
    </div>
    </div>
    <div class="story-meta">
    <div class="story-actions">
      <button type="button" data-like aria-label="按讚" aria-pressed="false" disabled>${storyIcon('heart')}<span data-likes class="visually-hidden">按讚</span></button>
      <button type="button" data-like-list aria-label="查看按讚的好友" aria-expanded="false" hidden></button>
      <button type="button" data-comment-focus aria-label="留言，${commentCount} 則" ${showComposer ? '' : 'disabled'}>${storyIcon('comment')}<span data-comment-count>${commentCount}</span></button>
      <button type="button" data-share-meal aria-label="分享餐照">${storyIcon('share')}</button>
    </div>
    <header class="meal-story-heading"><h3>${escape(meal.restaurant)}</h3><small>${escape(nameFor(meal.owner))} · ${escape(meal.eaten_on)}${meal.eaten_time ? ' · ' + escape(meal.eaten_time.slice(0, 5)) : ''}</small></header>
    </div>
    <div class="story-likers" data-story-likers hidden></div>
    ${meal.caption ? `<p class="meal-caption">${escape(meal.caption)}</p>` : ''}
    ${meal.place_id ? `<a class="meal-map" target="_blank" rel="noopener noreferrer" href="${escape(mapSearchLinks(meal.restaurant, meal.place_id).google)}">在 Google 地圖開啟 ↗</a>` : ''}
    ${showComposer ? `<section class="story-comments" aria-label="留言"><div data-comments>${examples.map((body, index) =>
      commentRow({ nickname: 'Jamie', body }, meal.id === 'sample-1' && index % 2 === 0)).join('')}</div></section>` : ''}
    <p class="story-feedback" role="status" data-story-status hidden></p>
    ${own && diner ? `<button type="button" class="delete-meal" data-delete-meal="${escape(meal.id)}">刪除紀錄</button>` : ''}
  </div>${form}</article>`;
}

function storyNotice(article, message) {
  const status = article.querySelector('[data-story-status]');
  status.textContent = message;
  status.hidden = !message;
}

async function refreshLikes(article) {
  const viewer = diner.id;
  const id = article.dataset.mealStory;
  const request = String(Number(article.dataset.likesRequest || 0) + 1);
  article.dataset.likesRequest = request;
  const [total, mine] = await Promise.all([
    client.from('meal_likes').select('meal_id', { count: 'exact', head: true }).eq('meal_id', id),
    client.from('meal_likes').select('meal_id').eq('meal_id', id).eq('owner', viewer).maybeSingle(),
  ]);
  checked(total);
  const liked = !!checked(mine);
  if (!article.isConnected || diner?.id !== viewer || article.dataset.likesRequest !== request) return;
  const button = article.querySelector('[data-like]');
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', liked ? '取消按讚' : '按讚');
  const list = article.querySelector('[data-like-list]');
  list.hidden = !total.count;
  list.textContent = total.count || '';
  list.setAttribute('aria-label', `查看按讚的好友，共 ${total.count || 0} 個讚`);
  list.setAttribute('aria-expanded', 'false');
  article.querySelector('[data-story-likers]').hidden = true;
  button.disabled = false;
}

function commentRow(comment, mine) {
  const own = diner?.id && comment.owner === diner.id;
  mine ??= own;
  return `<div class="story-comment${mine ? ' mine' : ''}">
    <div><strong>${mine ? '我' : escape(comment.nickname)}</strong><p>${escape(comment.body)}</p></div>
    ${own ? `<button type="button" data-delete-comment="${escape(comment.id)}" aria-label="刪除這則留言">×</button>` : ''}
  </div>`;
}

async function refreshComments(article, through) {
  const viewer = diner.id;
  const query = client.from('meal_comments').select('id,owner,nickname,body,created_at', { count: 'exact' })
    .eq('meal_id', article.dataset.mealStory).order('created_at', { ascending: false }).order('id', { ascending: false });
  const container = article.querySelector('[data-comments]');
  const start = through || 0;
  const request = String(Number(container.dataset.request || 0) + 1);
  container.dataset.request = request;
  const result = await query.range(start, start + 49);
  const comments = checked(result);
  if (!article.isConnected || diner?.id !== viewer || container.dataset.request !== request) return;
  const count = result.count ?? start + comments.length;
  article.querySelector('[data-comment-count]').textContent = count;
  article.querySelector('[data-comment-focus]').setAttribute('aria-label', `留言，${count} 則`);
  const items = comments.reverse().map(comment => commentRow(comment)).join('');
  const earlier = comments.length === 50 ? `<button type="button" data-older-comments="${start + 50}">看更早的留言</button>` : '';
  if (start) {
    container.querySelector('[data-older-comments]')?.remove();
    container.insertAdjacentHTML('afterbegin', earlier + items);
  } else container.innerHTML = earlier + items;
}

function loadStory(article, meal) {
  const track = article.querySelector('.gallery-track');
  showGalleryCount(track);
  if (!diner) return;
  const viewer = diner.id;
  const photos = article.hasAttribute('data-extra-loaded') ? null :
    client.from('meals').select('extra_photos').eq('id', meal.id).single().then(result => {
      const images = checked(result).extra_photos;
      if (!article.isConnected || diner?.id !== viewer || article.hasAttribute('data-extra-loaded')) return;
      if (images.length) track.insertAdjacentHTML('beforeend', galleryImages(meal, images, 1));
      article.setAttribute('data-extra-loaded', '');
      showGalleryCount(track);
    });
  void Promise.all([photos, refreshLikes(article), refreshComments(article)])
    .catch(() => { if (article.isConnected && diner?.id === viewer) storyNotice(article, '部分內容載入失敗，請稍後再試。'); });
}

function openDetails(button) {
  const source = diner ? (page === 'profile' ? personal : feed) : sample;
  if (button.dataset.meal) {
    const meal = source.find(item => item.id === button.dataset.meal);
    if (!meal) return;
    const meals = groupMeals(source, 'owner').get(meal.owner);
    openMealReader(meals, meals.indexOf(meal), button);
    return;
  }
  const meals = groupMeals(source.filter(meal => meal.owner === (diner?.id ?? '你') && meal.eaten_on === button.dataset.day), 'eaten_on').get(button.dataset.day);
  if (meals?.length) {
    detailBody.innerHTML = `<h2 id="detail-title">${escape(button.dataset.day)}</h2><div class="day-meals">${meals.map(meal => mealDetails(meal)).join('')}</div>`;
    detail.showModal();
    for (const [index, article] of [...detailBody.querySelectorAll('[data-meal-story]')].entries()) loadStory(article, meals[index]);
  }
}

async function action(work, errorMessage) {
  try { await work(); } catch { notice(errorMessage, true); }
}

function paintChosenPlace(form) {
  const box = form.querySelector('[data-chosen-place]');
  box.hidden = !draft.place;
  box.innerHTML = selectedPlace();
}

function clearRestaurantSuggestions(form) {
  clearTimeout(suggestionTimer);
  ++suggesting;
  const results = form.querySelector('[data-restaurant-suggestions]');
  results.hidden = true;
  results.replaceChildren();
  results.onclick = null;
  form.querySelector('[data-restaurant-status]').textContent = '';
}

function queueRestaurantSuggestions(input, composing = false) {
  const form = input.form;
  clearRestaurantSuggestions(form);
  const query = input.value.trim();
  if (composing || !config.mapsKey || query.length < 2) return;
  const request = suggesting;
  const active = () => request === suggesting && input.isConnected && !saving && query === input.value.trim();
  suggestionTimer = setTimeout(async () => {
    if (!active()) return;
    const results = form.querySelector('[data-restaurant-suggestions]');
    const status = form.querySelector('[data-restaurant-status]');
    try {
      const places = await suggestPlaces(query, config.mapsKey);
      if (!active()) return;
      if (!places.length) {
        results.innerHTML = '<p role="status">沒有符合的店家，可以直接用手填名稱。</p>';
      } else {
        results.innerHTML = `<div class="place-results" role="group" aria-label="店家建議">
          ${places.map((place, index) => `<button type="button" data-choose-place="${index}"><strong>${escape(place.displayName)}</strong><small>${escape(place.formattedAddress)}</small></button>`).join('')}
          <span class="map-attribution" translate="no">Google Maps</span>
        </div>`;
        results.onclick = event => {
          const choice = event.target.closest('[data-choose-place]');
          if (!choice || !active()) return;
          draft.place = places[Number(choice.dataset.choosePlace)];
          clearRestaurantSuggestions(form);
          paintChosenPlace(form);
          status.textContent = `已連結 ${draft.place.displayName}`;
          input.focus();
        };
      }
      results.hidden = false;
      if (places.length) status.textContent = `有 ${places.length} 間店家建議。`;
    } catch {
      if (!active()) return;
      results.innerHTML = '<p role="status">暫時無法取得店家建議，仍可手填店名。</p>';
      results.hidden = false;
    }
  }, 350);
}

async function placeSearch(form, value, button) {
  const query = value.trim();
  if (!query) return notice('先輸入店名或地址。', true);
  const results = form.querySelector('[data-place-results]');
  const input = form.elements.query;
  const active = () => form.isConnected && input.value.trim() === query && results.dataset.query === query;
  results.dataset.query = query;
  results.hidden = false;
  results.innerHTML = '<p role="status">找店中…</p>';
  button.disabled = true;
  try {
    const places = (await findPlaces(query, config.mapsKey)).filter(place => place.id && place.displayName);
    if (!active()) return;
    results.innerHTML = `<div class="place-results">
      ${places.map(place => `<a target="_blank" rel="noopener noreferrer" href="${escape(mapSearchLinks(query, place.id).google)}"><strong>${escape(place.displayName)}</strong><small>${escape(place.formattedAddress)}</small></a>`).join('') || '<p>找不到符合的店家。試試店名加分店或地區。</p>'}
      <span class="map-attribution" translate="no">Google Maps</span>
    </div>`;
  } catch {
    if (!active()) return;
    results.innerHTML = `<p role="status">目前無法在站內找店。 <a target="_blank" rel="noopener noreferrer" href="${escape(mapSearchLinks(query).google)}">改用 Google 地圖 ↗</a></p>`;
  } finally {
    button.disabled = false;
  }
}

async function storyAction(button, work) {
  const story = button.closest('[data-meal-story]');
  button.disabled = true;
  storyNotice(story, '');
  try { await work(story); } catch (error) { if (story.isConnected) storyNotice(story, error.message || '操作失敗，請稍後再試。'); }
  finally { button.disabled = false; }
}

detail.addEventListener('scroll', event => {
  if (event.target.matches?.('.gallery-track')) showGalleryCount(event.target);
}, { capture: true, passive: true });

detail.addEventListener('load', event => {
  if (!event.target.matches?.('.reader-page .detail-photo')) return;
  fitGalleryPhoto(event.target);
  showGalleryCount(event.target.closest('.gallery-track'));
}, true);

view.addEventListener('scroll', event => {
  const track = event.target;
  if (!track.matches?.('.tile-grid')) return;
  const arrows = track.previousElementSibling.querySelector('.feed-arrows');
  if (!arrows) return;
  arrows.firstElementChild.disabled = track.scrollLeft <= 2;
  arrows.lastElementChild.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
}, { capture: true, passive: true });

detail.addEventListener('close', () => {
  if (!detail.open) detailBody.replaceChildren();
});

photoSheet.addEventListener('cancel', event => {
  event.preventDefault();
  if (discardRecord()) goToPage(recordReturn);
});

function scrollToConversation(article) {
  const thread = article.querySelector('.story-comments');
  if (!thread) return;
  if (article.closest('.reader-page')) {
    const scroll = article.querySelector('.story-content');
    scroll.scrollTop = scroll.scrollHeight;
  } else thread.scrollIntoView({ block: 'end' });
}

detail.addEventListener('input', event => {
  if (event.target.name === 'message' && event.target.form?.matches('[data-comment]')) {
    commentDrafts.set(event.target.closest('[data-meal-story]').dataset.mealStory, event.target.value);
  }
});

detail.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-comment]')) return;
  event.preventDefault();
  const input = form.elements.message;
  const sent = input.value;
  const body = sent.trim();
  if (!diner || !body || form.querySelector('button').disabled) return;
  const viewer = diner.id;
  await storyAction(form.querySelector('button'), async article => {
    const result = await client.from('meal_comments').insert({ meal_id: article.dataset.mealStory, body });
    if (diner?.id !== viewer) return;
    if (result.error) throw Error('留言未送出，請再試一次。');
    if (input.value === sent) {
      input.value = '';
      commentDrafts.delete(article.dataset.mealStory);
    }
    await refreshComments(article);
    if (article.isConnected) scrollToConversation(article);
  });
});

document.addEventListener('pointerdown', () => document.documentElement.toggleAttribute('data-pointer-input', true), { capture: true, passive: true });
document.addEventListener('keydown', () => document.documentElement.removeAttribute('data-pointer-input'), true);

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (data.theme === 'light' || data.theme === 'dark') {
    document.documentElement.dataset.theme = data.theme;
    try { localStorage.setItem('fomery-theme', data.theme); } catch {}
    for (const option of button.parentElement.querySelectorAll('button[data-theme]')) {
      option.setAttribute('aria-pressed', String(option.dataset.theme === data.theme));
    }
  } else if (pages.includes(data.page)) {
    if (data.page === 'record') {
      if (page !== 'record') {
        recordReturn = page;
        goToPage('record');
        openPhotoSheet();
      } else openPhotoSheet(!!draft.photos?.length);
    } else if (page !== 'record' || discardRecord()) goToPage(data.page);
  } else if (data.closeRecord !== undefined) {
    if (discardRecord()) goToPage(recordReturn);
  } else if (data.editPhotos !== undefined) {
    openPhotoSheet(!!draft.photos?.length);
  } else if (data.finishPhotos !== undefined) {
    finishPhotoSheet();
  } else if (data.refresh !== undefined) {
    if (button.ariaBusy === 'true') return;
    button.ariaBusy = 'true';
    notice();
    void action(async () => {
      try {
        if (await refresh()) {
          const keepFocus = document.activeElement === button;
          render();
          if (keepFocus) view.querySelector('[data-refresh]')?.focus({ preventScroll: true });
        }
      } finally {
        button.removeAttribute('aria-busy');
      }
    }, '更新失敗，請稍後再試。');
  } else if (data.shiftRow) {
    const track = button.closest('.friend-row').querySelector('.tile-grid');
    const step = track.children[1].offsetLeft - track.children[0].offsetLeft;
    track.scrollBy({ left: Number(data.shiftRow) * step, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  } else if (data.selectPhoto) {
    if (!draft.reading && !saving) photoSheet.querySelector(`[name="${data.selectPhoto}"]`)?.click();
  } else if (data.pickCover !== undefined) {
    changeCover(Number(data.pickCover));
  } else if (data.dropPhoto !== undefined) {
    if (draft.reading || saving) return;
    draft.photos.splice(Number(data.dropPhoto), 1);
    paintRecordPhotos();
    pickerNotice();
    photoSheet.querySelector('[data-select-photo="photo"]').focus({ preventScroll: true });
  } else if (data.savePhoto !== undefined) {
    const file = draft.photos[Number(data.savePhoto)]?.original;
    if (file) void sharePhoto(file).catch(() => pickerNotice('原圖無法儲存，請再試一次。', true));
  } else if (data.clearPlace !== undefined) {
    const form = button.form;
    draft.place = undefined;
    paintChosenPlace(form);
    form.elements.restaurant.focus();
  } else if (data.meal || data.day) {
    openDetails(button);
  } else if (data.slide) {
    const track = button.closest('.story-gallery').querySelector('.gallery-track');
    const index = Math.round(track.scrollLeft / track.clientWidth) + Number(data.slide);
    track.scrollTo({ left: index * track.clientWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  } else if (data.commentFocus !== undefined) {
    const article = button.closest('[data-meal-story]');
    article.querySelector('[name="message"]:enabled')?.focus({ preventScroll: true });
    scrollToConversation(article);
  } else if (data.shareMeal !== undefined) {
    void storyAction(button, async article => {
      const img = article.querySelector('.detail-photo');
      await sharePhoto(mealCard(img, article.querySelector('h3').textContent));
    });
  } else if (data.like !== undefined && diner) {
    void storyAction(button, async article => {
      const meal_id = article.dataset.mealStory;
      const liked = button.getAttribute('aria-pressed') === 'true';
      const result = liked ? await client.from('meal_likes').delete().eq('meal_id', meal_id).eq('owner', diner.id)
        : await client.from('meal_likes').insert({ meal_id });
      if (result.error && result.error.code !== '23505') throw Error('無法更新按讚，請再試一次。');
      await refreshLikes(article);
      if (!liked && !reducedMotion.matches && button.isConnected) {
        button.firstElementChild.animate([{ transform: 'scale(.72)' }, { transform: 'scale(1.22)', offset: .65 }, { transform: 'scale(1)' }], { duration: 280 });
      }
    });
  } else if (data.likeList !== undefined && diner) {
    const article = button.closest('[data-meal-story]');
    const box = article.querySelector('[data-story-likers]');
    if (!box.hidden) {
      box.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    void storyAction(button, async () => {
      const viewer = diner.id;
      const votes = checked(await client.from('meal_likes').select('owner').eq('meal_id', article.dataset.mealStory));
      if (!article.isConnected || diner?.id !== viewer) return;
      const known = new Map(friends.filter(item => item.accepted && item.other).map(item => [item.other.id, item.other.nickname]));
      known.set(viewer, '你');
      const names = votes.map(vote => known.get(vote.owner)).filter(Boolean);
      box.textContent = names.join('、') || '目前沒有可顯示的好友';
      box.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    });
  } else if (data.olderComments && diner) {
    void storyAction(button, article => refreshComments(article, Number(data.olderComments)));
  } else if (data.deleteComment && diner) {
    void storyAction(button, async article => {
      checked(await client.from('meal_comments').delete().eq('id', data.deleteComment).eq('owner', diner.id));
      await refreshComments(article);
    });
  } else if (data.month) {
    const date = new Date(month + '-01T12:00:00');
    date.setMonth(date.getMonth() + Number(data.month));
    month = localDate(date).slice(0, 7);
    render();
    view.querySelector('[data-month="' + data.month + '"]').focus();
    void action(async () => {
      if (await refresh()) {
        render();
        view.querySelector('[data-month="' + data.month + '"]').focus();
      }
    }, '月曆載入失敗，請稍後再試。');
  } else if (data.copyId !== undefined || data.share !== undefined) {
    const isInvite = data.share !== undefined;
    const value = isInvite ? inviteLink() : diner.friend_id;
    void action(async () => {
      if (isInvite && navigator.share) {
        await navigator.share({ title: '加我為 Fomery 好友', url: value }).catch(error => { if (error.name !== 'AbortError') throw error; });
      } else {
        await navigator.clipboard.writeText(value);
        notice(isInvite ? '已複製邀請連結。' : '已複製好友 ID。');
      }
    }, '無法分享，請使用我的好友 ID 或邀請 QR Code。');
  } else if (data.request !== undefined || data.accept || data.remove) {
    void action(async () => {
      if (data.request !== undefined) {
        checked(await client.from('friend_requests').insert({ recipient: found.id }));
      } else {
        const [sender, recipient] = (data.accept || data.remove).split('/');
        const query = data.accept
          ? client.from('friend_requests').update({ accepted: true }).eq('accepted', false)
          : client.from('friend_requests').delete();
        const changed = checked(await query.eq('sender', sender).eq('recipient', recipient).select('sender'));
        if (!changed.length) throw Error();
      }
      await refresh();
      render();
      notice(data.accept ? '已成為好友。' : data.remove ? '好友狀態已更新。' : '好友申請已送出。');
    }, '好友狀態未能更新，請重新整理後再試。');
  } else if (data.deleteMeal && confirm('刪除這餐？好友動態和你的月曆都會移除。')) {
    void action(async () => {
      checked(await client.from('meals').delete().eq('id', data.deleteMeal).select('id').single());
      detail.close();
      await refresh();
      render();
      notice('已刪除這餐。');
    }, '刪除失敗，請稍後再試。');
  } else if (data.signOut !== undefined) {
    detail.close();
    void action(async () => checked(await client.auth.signOut()), '登出失敗，請稍後再試。');
  }
});

view.addEventListener('input', event => {
  const input = event.target;
  const form = input.form;
  if (form?.matches('[data-record]') && input.type !== 'file') {
    draft[input.name] = input.value;
    if (input.name === 'restaurant') {
      if (draft.place) {
        draft.place = undefined;
        paintChosenPlace(form);
      }
      queueRestaurantSuggestions(input, event.isComposing);
    }
  }
  if (input.name === 'query') {
    const results = form.querySelector('[data-place-results]');
    results.hidden = true;
    delete results.dataset.query;
  }
  if (input.form?.matches('[data-find]')) searchCode = input.value;
});

view.addEventListener('compositionstart', event => {
  if (event.target.name === 'restaurant') clearRestaurantSuggestions(event.target.form);
});

view.addEventListener('compositionend', event => {
  if (event.target.name === 'restaurant') queueRestaurantSuggestions(event.target);
});

view.addEventListener('focusout', event => {
  const field = event.target.closest('.restaurant-field');
  if (field && event.relatedTarget && !field.contains(event.relatedTarget)) {
    clearRestaurantSuggestions(field.closest('form'));
  }
});

view.addEventListener('keydown', event => {
  const target = event.target;
  if (event.isComposing || (target.name !== 'restaurant' && !target.matches('[data-choose-place]'))) return;
  const form = target.form;
  const input = form.elements.restaurant;
  if (event.key === 'Escape') {
    clearRestaurantSuggestions(form);
    input.focus();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const options = [...form.querySelectorAll('[data-choose-place]')];
    if (!options.length) return;
    const current = options.indexOf(target);
    const next = event.key === 'ArrowDown' ? options[current + 1] : (current < 0 ? options.at(-1) : options[current - 1] || input);
    event.preventDefault();
    next?.focus();
  }
});

photoSheet.addEventListener('change', async event => {
  const input = event.target;
  if (input.type !== 'file' || !input.files.length || draft.reading || saving) return;
  const files = [...input.files];
  input.value = '';
  const current = draft;
  const photos = draft.photos ||= [];
  const remaining = mealPhotoLimit - photos.length;
  if (!remaining) return pickerNotice(`每餐最多 ${mealPhotoLimit} 張，先移除一張再加。`, true);
  const errors = [];
  draft.reading = true;
  pickerNotice('照片處理中…');
  paintRecordPhotos();
  try {
    for (const file of files.slice(0, remaining)) {
      try { photos.push(await preparePhoto(file, input.name === 'camera')); }
      catch (error) { errors.push(error.message); }
      if (current !== draft) return;
    }
    if (photoSheet.open) pickerNotice(errors[0] || (files.length > remaining ? `每餐最多 ${mealPhotoLimit} 張，已加入前 ${remaining} 張。` : ''), !!errors.length);
  } finally {
    delete current.reading;
    if (current === draft) paintRecordPhotos(true);
  }
});

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  notice();
  if (form.matches('[data-explore]')) {
    if (config.mapsKey) await placeSearch(form, values.get('query'), event.submitter || form.querySelector('button'));
    else await action(() => window.open(mapSearchLinks(values.get('query')).google, '_blank', 'noopener,noreferrer'), '請輸入要查找的店名或地址。');
    return;
  }
  if (!session || saving || (form.matches('[data-record]') && draft.reading)) return;
  const submit = event.submitter ?? form.querySelector('button[type="submit"]');
  saving = true;
  submit.disabled = true;
  if (form.matches('[data-record]')) form.inert = true;
  try {
    if (form.matches('[data-profile]')) {
      const nickname = values.get('nickname').trim();
      if (!nickname) return notice('請輸入暱稱。', true);
      diner = checked(await client.from('diners').insert({ nickname }).select().single());
      await refresh();
      await openInvite();
      render();
    } else if (form.matches('[data-find]')) {
      await find(values.get('code'));
    } else if (form.matches('[data-record]')) {
      const submitted = draft;
      const owner = diner.id;
      const restaurant = values.get('restaurant').trim();
      const date = mealDateFromPhotos(draft.photos);
      if (!date || !restaurant) return notice('請先加入餐照並輸入店名。', true);
      const eaten_on = date.day;
      const [photo, ...extra_photos] = draft.photos.map(item => item.src);
      const nextMeal = { id: draft.id ??= crypto.randomUUID(), eaten_on, eaten_time: date.time,
        restaurant, place_id: draft.place?.id || null, caption: values.get('caption').trim(), photo, extra_photos };
      const result = await client.from('meals').insert(nextMeal);
      if (submitted !== draft) return;
      if (result.error?.code === '23505') {
        checked(await client.from('meals').select('id').eq('id', nextMeal.id).eq('owner', owner).single());
      } else checked(result);
      if (submitted !== draft) return;
      draft = {};
      page = 'profile';
      month = eaten_on.slice(0, 7);
      notice('已發布給好友。');
      await action(refresh, '已發布。月曆暫時無法更新，請稍後再試。');
      render(true);
    }
  } catch {
    notice('這次操作未能完成，請稍後再試。', true);
  } finally {
    saving = false;
    view.querySelector('[data-record]')?.removeAttribute('inert');
    submit.disabled = false;
  }
});

if (/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(config.url) && /^sb_publishable_[a-zA-Z0-9_-]+$/.test(config.key)) {
  await action(async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/supabase.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    client = window.supabase.createClient(config.url, config.key, { auth: { flowType: 'pkce', storageKey: 'fomery-journal-auth' } });
    login.addEventListener('click', () => {
      void action(async () => checked(await client.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: base.href },
      })), '無法開啟 Google 登入，請稍後再試。');
    });
    await initialize(checked(await client.auth.getSession()).session);
    client.auth.onAuthStateChange((_event, nextSession) => {
      if (session?.user.id === nextSession?.user.id) return;
      setTimeout(() => void action(() => initialize(nextSession), '無法載入帳號，請重新整理。'), 0);
    });
  }, '目前無法連線登入服務，請稍後再試。');
}
render();
if (url.searchParams.has('error')) notice('Google 登入未完成，請再試一次。', true);
