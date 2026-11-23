import { googleExploreEmbedUrl, mapSearchLinks } from './maps.mjs';
import { groupMeals, localDate, monthDates, sampleMeals, shiftDay } from './journal-data.mjs';
import { qrcode } from './vendor/qrcode.mjs';

const view = document.querySelector('#view');
const status = document.querySelector('#status');
const login = document.querySelector('#login');
const detail = document.querySelector('#meal-detail');
const detailBody = document.querySelector('#detail-body');
const pages = ['feed', 'friends', 'record', 'explore', 'profile'];
const friendCode = /^[a-f0-9]{12}$/;
const photoLimit = 350000;
const sample = sampleMeals();
const config = await fetch('./journal-config.json', { cache: 'no-store' }).then(response => response.json()).catch(() => ({}));
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
let draft = {};
let month = localDate().slice(0, 7);
const url = new URL(location.href);
const invite = url.searchParams.get('invite') || sessionStorage.getItem('fomery-invite');
const entry = friendCode.test(invite || '') ? invite : '';
if (entry) sessionStorage.setItem('fomery-invite', entry);
const base = new URL(url.pathname, url.origin);
let searchCode = entry;
let page = entry ? 'friends' : 'feed';

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
  const rows = [...groupMeals(meals, 'owner', 2)].map(([owner, items]) =>
    '<section class="friend-row"><h3>' + escape(nameFor(owner)) + '</h3><div class="tile-grid">' + items.map(tile).join('') + '</div></section>');
  const action = diner ? '<button type="button" data-refresh>更新</button>' : '<small>示範餐照</small>';
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
  return title('個人', diner ? '<button type="button" data-refresh>更新</button>' : '') + account
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

function recordPage() {
  const preview = draft.photo ? '<img class="draft-photo" src="' + draft.photo + '" alt="待發布的餐照">' : '';
  const date = draft.eaten_on || localDate();
  return title('記錄一餐') + '<form class="fields" data-record>'
    + '<div class="record-picture"><label>餐照<input type="file" accept="image/*" name="photo"></label>'
    + '<label>直接拍照<input type="file" accept="image/*" capture="environment" name="camera"></label></div>'
    + '<div data-preview>' + preview + '</div>'
    + '<label>用餐店家<input name="restaurant" maxlength="100" required placeholder="輸入店名" value="' + escape(draft.restaurant) + '"></label>'
    + '<label>心得（選填）<textarea name="caption" rows="3" maxlength="280" placeholder="這餐吃起來怎樣？當時是什麼心情？">' + escape(draft.caption) + '</textarea></label>'
    + '<label>用餐日期<input type="date" name="eaten_on" max="' + localDate() + '" required value="' + date + '"></label>'
    + '<div class="controls"><button type="submit" class="primary"' + (diner ? '' : ' disabled') + '>發布給好友</button>'
    + (diner ? '' : '<small>登入後可發布餐照。</small>') + '</div></form>';
}

function explorePage() {
  return title('探索')
    + '<form class="fields" data-explore><label>找店<input name="query" required maxlength="180" placeholder="輸入店名、地址或地區"></label>'
    + '<div><button type="submit" class="primary">在 Google 地圖找店 ↗</button></div></form>'
    + '<iframe class="explore-map" title="地圖" loading="lazy" referrerpolicy="no-referrer" src="' + escape(googleExploreEmbedUrl) + '"></iframe>';
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
      activePage === 'feed' ? client.rpc('recent_friend_meals', { first_day: shiftDay(localDate(), -6), last_day: localDate() }) : Promise.resolve({ data: [] }),
    ]);
    if (updating !== turn) return;
    friends = checked(rows).map(row => ({ ...row, other: row.sender === owner ? row.recipient_info : row.sender_info }));
    if (activePage === 'feed') feed = checked(meals);
  }
  if (activePage === 'profile') {
    const { first, next } = monthDates(month);
    const result = await client.from('meals').select('*').eq('owner', owner).gte('eaten_on', first).lt('eaten_on', next);
    if (updating === turn) personal = checked(result);
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

async function jpeg(file) {
  if (file.size > 30 * 1024 * 1024) throw Error('請選擇小於 30 MB 的照片。');
  const image = await createImageBitmap(file).catch(() => { throw Error('這張照片無法讀取，請改選 JPG 或 PNG。'); });
  try {
    const canvas = document.createElement('canvas');
    for (const size of [1000, 720, 480]) {
      const scale = Math.min(1, size / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', .82);
      if (encoded.length <= photoLimit && encoded.startsWith('data:image/jpeg;base64,')) return encoded;
    }
    throw Error('這張照片太大，請選另一張。');
  } finally {
    image.close();
  }
}

function mealDetails(meal) {
  const remove = diner?.id === meal.owner ? '<button type="button" data-delete-meal="' + meal.id + '">刪除紀錄</button>' : '';
  return '<article>' + photo(meal, meal.restaurant + '的餐照', 'detail-photo') + '<h3>' + escape(meal.restaurant) + '</h3>'
    + '<small>' + escape(nameFor(meal.owner)) + ' · ' + escape(meal.eaten_on) + '</small>'
    + (meal.caption ? '<p>' + escape(meal.caption) + '</p>' : '') + remove + '</article>';
}

function openDetails(button) {
  const source = diner ? (page === 'profile' ? personal : feed) : sample;
  const meals = button.dataset.day
    ? groupMeals(source.filter(meal => meal.owner === (diner?.id ?? '你') && meal.eaten_on === button.dataset.day), 'eaten_on').get(button.dataset.day)
    : source.filter(meal => meal.id === button.dataset.meal);
  if (meals?.length) {
    detailBody.innerHTML = '<h2 id="detail-title">' + escape(button.dataset.day || meals[0].restaurant) + '</h2>'
      + '<div class="day-meals">' + meals.map(mealDetails).join('') + '</div>';
    detail.showModal();
  }
}

async function action(work, errorMessage) {
  try { await work(); } catch { notice(errorMessage, true); }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (pages.includes(data.page)) {
    page = data.page;
    notice();
    render(true);
    window.scrollTo(0, 0);
    void action(async () => { if (await refresh()) render(true); }, '載入失敗，請稍後再試。');
  } else if (data.refresh !== undefined) {
    notice();
    void action(async () => { if (await refresh()) render(true); }, '更新失敗，請稍後再試。');
  } else if (data.meal || data.day) {
    openDetails(button);
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
  if (input.form?.matches('[data-record]') && input.type !== 'file') draft[input.name] = input.value;
  if (input.form?.matches('[data-find]')) searchCode = input.value;
});

view.addEventListener('change', async event => {
  const input = event.target;
  const file = input.type === 'file' && input.files[0];
  if (!file) return;
  const current = draft;
  const form = input.form;
  if (form.dataset.reading) return;
  form.dataset.reading = 'true';
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const picture = await jpeg(file);
    if (current !== draft) return;
    draft.photo = picture;
    form.querySelector('[data-preview]').innerHTML = '<img class="draft-photo" src="' + picture + '" alt="待發布的餐照">';
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    delete form.dataset.reading;
    submit.disabled = !diner;
  }
});

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  notice();
  if (form.matches('[data-explore]')) {
    await action(() => window.open(mapSearchLinks(values.get('query')).google, '_blank', 'noopener,noreferrer'), '請輸入要查找的店名或地址。');
    return;
  }
  if (!session || saving) return;
  const submit = event.submitter ?? form.querySelector('button[type="submit"]');
  saving = true;
  submit.disabled = true;
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
      const restaurant = values.get('restaurant').trim();
      if (!draft.photo || !restaurant) return notice('請先選一張餐照並輸入店名。', true);
      const eaten_on = values.get('eaten_on');
      const nextMeal = { id: draft.id ??= crypto.randomUUID(), eaten_on, restaurant, caption: values.get('caption').trim(), photo: draft.photo };
      const result = await client.from('meals').insert(nextMeal);
      if (result.error?.code === '23505') {
        checked(await client.from('meals').select('id').eq('id', nextMeal.id).eq('owner', diner.id).single());
      } else checked(result);
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
