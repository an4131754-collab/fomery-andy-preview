const samples = [
  ['巷尾吐司', '早餐', 1], ['日光飯糰', '早餐', 1], ['木窗蛋餅', '早餐', 1],
  ['長街小麵', '麵食', 2], ['暖湯食堂', '鍋物', 3], ['老井米粉', '麵食', 2],
  ['山線咖啡', '咖啡', 2], ['白砂豆花', '甜點', 1], ['雙椅茶屋', '飲品', 2],
  ['青禾早午餐', '早餐', 2], ['一口布丁', '甜點', 2], ['福街餃子', '麵食', 2],
  ['東角小火鍋', '鍋物', 3], ['橘門咖啡', '咖啡', 3], ['早起碗粿', '早餐', 1],
  ['晴日冰菓室', '甜點', 2], ['花磚茶舖', '飲品', 1], ['樹下湯麵', '麵食', 2],
];

export const restaurants = new Map(samples.map(([name, cuisine, price], index) => {
  const id = String(index + 1);
  const district = ['北巷', '中街', '南埕'][Math.floor(index / 6)];
  return [id, { id, name, cuisine, price, city: '示範市', district }];
}));

export function createDemoState() {
  const ids = ['7', '4', '1', '11', '5', '2', '8', '6', '3', '9'];
  return {
    ranked: ids.map((id, index) => ({
      ...restaurants.get(id), mood: index < 7 ? 'liked' : 'fine',
      value: index < 7 ? 2.95 - index * .12 : 1.8 - (index - 7) * .2,
      tags: index < 3 ? ['值得再訪'] : ['日常口袋名單'],
      note: ['採光很舒服，適合留一個下午給自己。', '湯頭很有層次，下次還想再來。', '簡單的早餐，也能讓一天變得很好。'][index % 3],
      companions: index % 2 ? 'Alex' : 'Jamie', date: '2026-11-07',
      ratedAt: 1794000000000 - index * 86400000,
    })),
    saved: ['10', '16', '13'], recent: [],
  };
}
