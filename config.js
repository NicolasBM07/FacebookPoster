/**
 * Central settings. Edit DESCRIPTION before the first real run.
 */
module.exports = {
  INVENTORY_URL: "https://www.abbotsfordhyundai.com/inventory/used/",

  // Max photos downloaded and uploaded per vehicle
  MAX_PHOTOS: 19,

  // The new website template lists the gallery as: photo 1, then the last photo back to photo 2.
  // true  = fix that (photo 1 first, then the rest reversed back into website order)
  // false = keep the order exactly as found on the page
  FIX_GALLERY_ORDER: true,

  // Website photos carry a watermark strip along the top. Crop is proportional, so a
  // 1600x1200 photo becomes 1280x960 (240px off the top, 160px off each side).
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
  🔖 Stock #: {STOCK}

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
  Advertised price is the finance price; dealer number 31001
  vehicle stock number {STOCK}, cash price may differ. 
  Please refer to our website for the most up‐to‐date information.

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