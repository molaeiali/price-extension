export default {
  role: "usdt",
  label: "USDT (Bitpin)",
  settingsKey: "show-usdt",
  url: "https://api.bitpin.org/v5/mkt/markets/?code=USDT_IRT",
  icon: "usdt.svg",
  priceFrom(data) {
    return data.results[0].price_info.price;
  },
};
