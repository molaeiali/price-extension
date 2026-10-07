export default {
  role: "copper",
  label: "Copper",
  settingsKey: "show-copper",
  url: "https://api.meschi.ir/api/market/getCopperPrice",
  icon: "copper.svg",
  priceFrom(data) {
    return data.price;
  },
};
