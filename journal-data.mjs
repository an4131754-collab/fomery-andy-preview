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
    b.eaten_on.localeCompare(a.eaten_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  for (const meal of sorted) {
    if (!groups.has(meal[key])) groups.set(meal[key], []);
    if (groups.get(meal[key]).length < limit) groups.get(meal[key]).push(meal);
  }
  return groups;
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
  return examples.map(([owner, restaurant, caption], index) => ({
    id: 'sample-' + (index + 1),
    owner,
    restaurant,
    caption,
    photo: './meal-photos/' + (index + 1) + '.jpg',
    eaten_on: shiftDay(today, index < 8 ? -Math.floor(index / 2) : 0),
    created_at: index % 2 ? '12:00' : '18:00',
  }));
}
