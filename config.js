/**
 * Central settings. Edit DESCRIPTION before the first real run.
 */
module.exports = {
  INVENTORY_URL: "https://www.abbotsfordhyundai.com/inventory/used/",

  // Max photos downloaded and uploaded per vehicle
  MAX_PHOTOS: 19,

  // The image server makes any size on request. The page's full photo list only has small 768px
  // versions, so step 1/3 swap in these size codes to get the large photo.
  FULL_SIZE_PARAMS: "w_1920,h_1440,q_75",

  // Website photos carry a watermark strip along the top. Crop is proportional (percent of the photo):
  // topPct removed from the top, sidePct removed from EACH side (0 = no side crop).
  CROP: { enabled: true, topPct: 0.2, sidePct: 0},

  // Only images hosted on a matching host are treated as vehicle photos
  IMAGE_HOST_PATTERN: "edealer\\.ca",

  // Pause between Facebook listings
  DELAY_MIN_MS: 9000,
  DELAY_MAX_MS: 15000,

  USER_AGENT:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",

  // Step 4 refuses to post while this still starts with EDIT_ME
  // {STOCK} is replaced with each vehicle's stock number. Move that line wherever you like.
  DESCRIPTION: `NICOLAS MILLAN 
  
  📞 Check availability at 7O5 929 71 -11 

  🚘 AT, Best Price Dealer for 2026   
  💵 Vehicles Under $10k   
  🛠️ Certified Vehicles
  👍 All Credit Accepted!
  ✅ $0 Down Financing     
  🔄 All Trades Welcome 

  *All sales are subject to taxes, a $799 documentation fee,
  and an $119 fuel surcharge. Hyundai Certified Pre‐Owned (CPO)
  vehicles may also be subject to a Hyundai CPO certification 
  fee of up to $1,299. This fee does not apply to non‐Hyundai vehicles. 
  Advertised price is the finance price; dealer number: 31001 stock #: {STOCK}
  cash price may differ. Please refer to our website for the most up‐to‐date information.
  `,

  // Description for one vehicle (fills in the stock number)
  buildDescription(v) {
    return this.DESCRIPTION.split("{STOCK}").join(v.stockNumber || v.vin || "");
  },

  // All vehicles are certified, so one title format for everything
  buildTitle(v) {
    return `${v.year} ${v.make} ${v.model} | CERTIFIED | ${v.stockNumber || v.vin}`;
  },
};