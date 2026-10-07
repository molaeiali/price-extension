export default {
  role: "gold",
  label: "Gold (Talasea)",
  url: "https://talasea.ir/blog/api/v1/price",
  icon: "gold.svg",
  priceFrom(data) {
    return `${data.data.gold_talasea / 1000} - ${data.data.ounce}`;
  },
};
