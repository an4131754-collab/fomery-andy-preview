export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join('-');
}

export function shiftDay(day, amount) {
  const date = new Date(day + 'T12:00:00');
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

export function monthDates(month) {
  const first = month + '-01';
  const date = new Date(first + 'T12:00:00');
  const blanks = (date.getDay() + 6) % 7;
  date.setMonth(date.getMonth() + 1);
  const next = localDate(date);
  const days = Number(shiftDay(next, -1).slice(-2));
  return { first, next, days, blanks };
}

export function groupMeals(meals, key, limit = Infinity) {
  const groups = new Map();
  const sorted = [...meals].sort((a, b) =>
    b.eaten_on.localeCompare(a.eaten_on) || (b.eaten_time || '').localeCompare(a.eaten_time || '')
    || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  for (const meal of sorted) {
    if (!groups.has(meal[key])) groups.set(meal[key], []);
    if (groups.get(meal[key]).length < limit) groups.get(meal[key]).push(meal);
  }
  return groups;
}

export const mealPhotoLimit = 6;

export function mealDateFromPhotos(photos, now = new Date()) {
  const cover = photos?.[0];
  if (!cover) return null;
  const stamp = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/.exec(cover.takenAt);
  if (stamp && localDate(new Date(stamp[1] + 'T12:00:00')) === stamp[1]) {
    return { day: stamp[1], time: stamp[2], source: 'photo' };
  }
  const modified = new Date(cover.modifiedAt);
  const hasFileTime = cover.modifiedAt > 0 && !Number.isNaN(modified.getTime());
  const date = hasFileTime ? modified : new Date(cover.addedAt ?? now);
  return { day: localDate(date), time: date.toTimeString().slice(0, 8), source: hasFileTime ? 'file' : 'added' };
}

const examples = [
  ['Jamie', '鍋物', '把蛋拌進湯裡，最後連飯也拌著吃。'],
  ['Jamie', '家常肉片', '醬汁剛好，今天就想吃這種配飯的菜。'],
  ['Alex', '香煎肉片', '邊緣煎得脆脆的，配菇剛好。'],
  ['Alex', '燒肉', '烤好第一片就想再添一口白飯。'],
  ['Mika', '牛肉湯', '先喝一口湯，再把肉沾點薑絲。'],
  ['Mika', '拉麵', '天冷的時候，這碗吃得特別舒服。'],
  ['小禾', '咖哩', '今天想慢慢吃，烤餅留到最後沾咖哩。'],
  ['小禾', '關東煮', '蘿蔔吸飽湯，點這個就對了。'],
  ['你', '家常定食', '想安靜吃點平常的菜，吃完很滿足。'],
  ['你', '肉燥飯和湯', '一口飯、一口湯，這樣就很好。'],
];

export function sampleMeals(today = localDate()) {
  const meals = examples.map(([owner, restaurant, caption], index) => ({
    id: 'sample-' + (index + 1),
    owner,
    restaurant,
    caption,
    photo: './meal-photos/' + (index + 1) + '.jpg',
    eaten_on: shiftDay(today, index < 8 ? -Math.floor(index / 2) : 0),
    created_at: index % 2 ? '12:00' : '18:00',
  }));
  meals[0].extra_photos = ['./meal-photos/3.jpg'];
  meals[6].photo = './meal-photos/curry-portrait.jpg';
  meals[6].extra_photos = ['./meal-photos/7.jpg'];
  meals.push({ ...meals[0], id: 'sample-11', restaurant: '肉燥飯和湯', photo: './meal-photos/10.jpg',
    extra_photos: [], eaten_on: shiftDay(today, -1), created_at: '08:00', caption: '早餐吃碗熱湯。' });
  return meals;
}
