// Social demo domain. All users and transactions are simulated locally.
import { restaurants } from './catalog.mjs';
export const people = { you: '你', jamie: 'Jamie', alex: 'Alex', mika: 'Mika' };
export const skins = [
  { id: 'classic', name: '原味糰子', price: 0, icon: '🌱' },
  { id: 'chef', name: '小小主廚', price: 80, icon: '👨‍🍳' },
  { id: 'berry', name: '草莓野餐', price: 120, icon: '🍓' },
  { id: 'royal', name: '星光皇冠', price: 300, icon: '👑' },
];
export function petStage(xp) {
  return xp >= 140 ? { name: '餐桌守護神', icon: '🐲', next: 140 }
    : xp >= 60 ? { name: '美食探險家', icon: '🐥', next: 140 }
      : { name: '糰子寶寶', icon: '🐣', next: 60 };
}
export function demoDay(s) {
  const now = new Date();
  now.setDate(now.getDate() + s.dayOffset);
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function createSocialState() {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 7);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T18:30`;
  return { actor: 'you', dayOffset: 0, friends: [['you','jamie'], ['you','alex'], ['jamie','alex']], requests: [],
    groups: [
      { id:'foodies', name:'今天吃什麼', description:'一起找好吃的，也一起把糰子養大。', members:['you','jamie','alex'] },
      { id:'coffee', name:'週末咖啡散步', description:'每週一間咖啡店，認識一位新朋友。', members:['jamie','alex','mika'] },
    ],
    events: [{ id:'dinner', title:'週末暖湯小聚', group:'foodies', place:'5', date, capacity:4, host:'jamie', members:['jamie'], invited:['you'] }],
    posts: [], messages: [], petInteractions: [],
    pets: Object.fromEntries(Object.keys(people).map((id,i) => [id, { xp:40+i*40, coins:100, skin:'classic', owned:['classic'], rewardedDays:[] }])),
  };
}
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export const areFriends = (s,a,b) => s.friends.some(pair => pair.includes(a) && pair.includes(b));
export function transition(state, action) {
  const s = structuredClone(state), actor = s.actor;
  s.messages ??= [];
  s.petInteractions ??= [];
  const target = action.target;
  const group = s.groups.find(g => g.id === (action.group || action.id));
  const event = s.events.find(e => e.id === action.id);
  const pet = s.pets[actor];
  switch (action.type) {
    case 'actor':
      requireThat(Object.hasOwn(people, action.id), '找不到這個示範角色'); s.actor = action.id; break;
    case 'request':
      requireThat(Object.hasOwn(people,target) && target !== actor, '請選擇其他角色');
      requireThat(!areFriends(s,actor,target) && !s.requests.some(r => [r.from,r.to].includes(actor) && [r.from,r.to].includes(target)), '已是好友或已有待處理邀請');
      s.requests.push({ from:actor, to:target }); break;
    case 'accept':
      requireThat(s.requests.some(r => r.from === target && r.to === actor), '找不到好友邀請');
      s.requests = s.requests.filter(r => !(r.from === target && r.to === actor));
      if (!areFriends(s,actor,target)) s.friends.push([actor,target]); break;
    case 'joinGroup':
      requireThat(group, '找不到群組');
      if (!group.members.includes(actor)) group.members.push(actor); break;
    case 'createEvent': {
      requireThat(group?.members.includes(actor), '請先加入群組');
      const capacity = Number(action.capacity);
      requireThat(action.title?.trim() && action.title.trim().length <= 60 && restaurants.has(action.place), '請填寫活動名稱與餐廳');
      requireThat(Number.isInteger(capacity) && capacity >= 2 && capacity <= 12, '聚餐人數須為 2–12 人');
      requireThat(Number.isFinite(Date.parse(action.date)) && action.date.slice(0,10) >= demoDay(s), '請選擇今天或之後的有效日期');
      s.events.unshift({ id:crypto.randomUUID(), title:action.title.trim(), group:group.id, place:action.place, date:action.date, capacity, host:actor, members:[actor], invited:[] }); break;
    }
    case 'invite':
      requireThat(event?.host === actor, '只有主辦人可以邀請朋友');
      requireThat(areFriends(s,actor,target), '請先加入好友');
      requireThat(!event.members.includes(target) && !event.invited.includes(target), '對方已加入或已受邀');
      requireThat(event.members.length < event.capacity, '聚餐已額滿');
      event.invited.push(target); break;
    case 'joinEvent':
      requireThat(event, '找不到活動');
      requireThat(event.date.slice(0,10) >= demoDay(s), '這場聚餐已結束');
      requireThat(s.groups.find(g => g.id === event.group).members.includes(actor), '請先加入活動所屬群組');
      requireThat(!event.members.includes(actor), '你已經報名');
      requireThat(event.members.length < event.capacity, '聚餐已額滿');
      event.members.push(actor); event.invited = event.invited.filter(id => id !== actor); break;
    case 'leaveEvent':
      requireThat(event && event.host !== actor, '主辦人不能退出自己的聚餐');
      event.members = event.members.filter(id => id !== actor); break;
    case 'message': {
      requireThat(group?.members.includes(actor), '請先加入群組再聊天');
      const text = action.text?.trim();
      requireThat(text && text.length <= 200, '請輸入 1–200 字的訊息');
      s.messages.push({ id:crypto.randomUUID(), actor, group:group.id, text, day:demoDay(s), time:new Date().toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit', hour12:false }) });
      break;
    }
    case 'petPlay': {
      requireThat(group?.members.includes(actor) && group.members.includes(target) && actor !== target, '只能與同群組其他成員的寵物互動');
      const day = demoDay(s);
      requireThat(!s.petInteractions.some(i => i.day === day && [i.actor,i.target].includes(actor) && [i.actor,i.target].includes(target)), '今天已經一起玩過了，明天再來吧！');
      pet.xp += 5; s.pets[target].xp += 5;
      s.petInteractions.push({ id:crypto.randomUUID(), actor, target, group:group.id, day });
      break;
    }
    case 'post': {
      requireThat(group?.members.includes(actor), '請先加入群組再發文');
      const text = action.text?.trim();
      requireThat(text && text.length <= 280, '請輸入 1–280 字的用餐分享');
      const day = demoDay(s);
      const before = pet.xp, rewarded = !pet.rewardedDays.includes(day);
      if (!pet.rewardedDays.includes(day)) {
        pet.rewardedDays.push(day); pet.xp += 20; pet.coins += 30;
      }
      const growth = { before, after:pet.xp, xp:pet.xp-before, coins:rewarded ? 30 : 0, evolved:petStage(before).name !== petStage(pet.xp).name };
      s.posts.unshift({ id:crypto.randomUUID(), actor, group:group.id, text, day, growth });
      break;
    }
    case 'nextDay': s.dayOffset += 1; break;
    case 'skin': {
      const skin = skins.find(item => item.id === action.id);
      requireThat(skin, '找不到造型');
      if (!pet.owned.includes(skin.id)) {
        requireThat(pet.coins >= skin.price, '示範金幣不足，明天發文再來看看');
        pet.coins -= skin.price; pet.owned.push(skin.id);
      }
      pet.skin = skin.id; break;
    }
    default: throw new Error('不支援的操作');
  }
  return s;
}
