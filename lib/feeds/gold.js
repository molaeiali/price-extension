export default {
  role: "gold",
  label: "Gold",
  settingsKey: "show-gold",
  url: "https://api.talasea.ir/api/market/getGoldPrice",
  icon: "gold.svg",
  priceFrom(data) {
    return data.price;
  },
};
