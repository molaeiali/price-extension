export default {
  role: "silver",
  label: "Silver (Noghresea)",
  url: "https://api.noghresea.ir/api/market/getSilverPrice",
  icon: "silver.svg",
  priceFrom(data) {
    return String(Number(data.price) * 1000);
  },
};
