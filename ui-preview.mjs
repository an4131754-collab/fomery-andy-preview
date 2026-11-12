import { restaurants } from './catalog.mjs';
import { visiblePhotos } from './photos.mjs';
import { people } from './social.mjs';
import { photoCard, photoFrame, invitesPanel, hasFriends } from './photo-ui.mjs';

function tiles(photos, showName = true) {
  return '<div class="preview-tiles">' + photos.map(photo => {
    const place = restaurants.get(photo.place);
    // Photo IDs also originate from user records. Escape before putting them in an attribute.
    const id = photo.id.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    return `<button type="button" data-ui-photo="${id}">${photoFrame(photo)}
      <strong>${place.name}</strong><small>${showName ? people[photo.actor] + ' · ' : ''}${photo.takenAt.slice(5, 10).replace('-', '/')}</small></button>`;
  }).join('') + '</div>';
}
function album(photos) {
  const weeks = new Map();
  const dateLabel = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  for (const photo of photos) {
    const date = new Date(photo.takenAt.slice(0, 10) + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const week = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(photo);
  }
  return [...weeks].map(([week, items]) => {
    if (!week) return `<section class="preview-group"><h3>其他日期</h3>${tiles(items)}</section>`;
    const start = new Date(week + 'T12:00:00Z');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `<section class="preview-group"><h3>${dateLabel.format(start)} – ${dateLabel.format(end)}</h3>${tiles(items)}</section>`;
  }).join('');
}

function byFriend(photos) {
  const groups = new Map();
  for (const photo of photos) {
    if (!groups.has(photo.actor)) groups.set(photo.actor, []);
    groups.get(photo.actor).push(photo);
  }
  return [...groups].map(([actor, items]) => `<section class="preview-group">
    <header><span class="avatar" aria-hidden="true">${people[actor].slice(0, 1)}</span><h3>${people[actor]}</h3></header>
    ${tiles(items, false)}</section>`).join('');
}

export function journalActivity(mode, state, toolbar, selection) {
  const friends = visiblePhotos(state, 'friends');
  const mine = visiblePhotos(state, 'mine');
  const all = [...friends, ...mine].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const opened = all.find(photo => photo.id === selection);
  if (opened) {
    return `<div class="preview-heading"><button type="button" class="text-button" data-ui-photo="">‹ 返回</button>
      <h2 id="view-title">用餐照片</h2></div>${photoCard(state, opened)}`;
  }
  const title = { feed: '朋友近況', album: '每週相簿', friends: '飯友餐桌' }[mode];
  const friendPhotos = friends.length ? friends : mine;
  const content = {
    feed: () => all.slice(0, 8).map(photo => photoCard(state, photo)).join(''),
    album: () => album(all),
    friends: () => byFriend(friendPhotos),
  }[mode]();
  return `<div class="preview-heading"><h2 id="view-title">${title}</h2></div>
    <div class="preview-content">${content || '<p class="empty-state">還沒有照片。按下方「記錄」加入第一餐。</p>'}</div>
    ${hasFriends(state) ? '' : '<p><button type="button" data-page="community">邀請朋友</button></p>'}
    ${invitesPanel(state)}
    <details class="preview-tools"><summary>展示設定</summary>${toolbar}
      <p>切換角色試用好友互動。紀錄只保存在此瀏覽器。</p></details>`;
}
