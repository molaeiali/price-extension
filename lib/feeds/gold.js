export default {
  role: "gold",
  label: "Gold (Talasea)",
  settingsKey: "show-gold",
  url: "https://talasea.ir/blog/api/v1/price",
  icon: "gold.svg",
  priceFrom(data) {
    return `mg: ${data.data.gold_talasea / 1000} - oz: ${data.data.ounce}`;
  },
};
