const PLACES = [
  { name: "甘肃", aliases: ["甘肃省"], latitude: 36.0611, longitude: 103.8343, level: "省份" },
  { name: "北京", aliases: ["北京市", "北京朝阳", "北京海淀"], latitude: 39.9042, longitude: 116.4074, level: "直辖市" },
  { name: "上海", aliases: ["上海市", "上海浦东", "上海徐汇"], latitude: 31.2304, longitude: 121.4737, level: "直辖市" },
  { name: "天津", aliases: ["天津市"], latitude: 39.3434, longitude: 117.3616, level: "直辖市" },
  { name: "重庆", aliases: ["重庆市"], latitude: 29.5630, longitude: 106.5516, level: "直辖市" },
  { name: "哈尔滨", aliases: ["黑龙江哈尔滨", "哈尔滨市"], latitude: 45.8038, longitude: 126.5349, level: "城市" },
  { name: "长春", aliases: ["吉林长春", "长春市"], latitude: 43.8171, longitude: 125.3235, level: "城市" },
  { name: "沈阳", aliases: ["辽宁沈阳", "沈阳市"], latitude: 41.8057, longitude: 123.4315, level: "城市" },
  { name: "呼和浩特", aliases: ["内蒙古呼和浩特", "呼市"], latitude: 40.8426, longitude: 111.7492, level: "城市" },
  { name: "石家庄", aliases: ["河北石家庄", "石家庄市"], latitude: 38.0428, longitude: 114.5149, level: "城市" },
  { name: "太原", aliases: ["山西太原", "太原市"], latitude: 37.8706, longitude: 112.5489, level: "城市" },
  { name: "济南", aliases: ["山东济南", "济南市"], latitude: 36.6512, longitude: 117.1201, level: "城市" },
  { name: "青岛", aliases: ["山东青岛", "青岛市"], latitude: 36.0671, longitude: 120.3826, level: "城市" },
  { name: "郑州", aliases: ["河南郑州", "郑州市"], latitude: 34.7466, longitude: 113.6254, level: "城市" },
  { name: "西安", aliases: ["陕西西安", "西安市"], latitude: 34.3416, longitude: 108.9398, level: "城市" },
  { name: "兰州", aliases: ["甘肃兰州", "兰州市"], latitude: 36.0611, longitude: 103.8343, level: "城市" },
  { name: "陇南", aliases: ["甘肃陇南", "甘肃省陇南", "陇南市", "甘肃陇南市", "武都", "陇南武都"], latitude: 33.4007, longitude: 104.9218, level: "城市" },
  { name: "天水", aliases: ["甘肃天水", "天水市"], latitude: 34.5809, longitude: 105.7249, level: "城市" },
  { name: "酒泉", aliases: ["甘肃酒泉", "酒泉市"], latitude: 39.7328, longitude: 98.4944, level: "城市" },
  { name: "嘉峪关", aliases: ["甘肃嘉峪关", "嘉峪关市"], latitude: 39.7720, longitude: 98.2891, level: "城市" },
  { name: "张掖", aliases: ["甘肃张掖", "张掖市"], latitude: 38.9259, longitude: 100.4498, level: "城市" },
  { name: "武威", aliases: ["甘肃武威", "武威市"], latitude: 37.9283, longitude: 102.6379, level: "城市" },
  { name: "白银", aliases: ["甘肃白银", "白银市"], latitude: 36.5447, longitude: 104.1389, level: "城市" },
  { name: "定西", aliases: ["甘肃定西", "定西市"], latitude: 35.5807, longitude: 104.6263, level: "城市" },
  { name: "平凉", aliases: ["甘肃平凉", "平凉市"], latitude: 35.5428, longitude: 106.6653, level: "城市" },
  { name: "庆阳", aliases: ["甘肃庆阳", "庆阳市"], latitude: 35.7091, longitude: 107.6436, level: "城市" },
  { name: "临夏", aliases: ["甘肃临夏", "临夏市", "临夏回族自治州"], latitude: 35.6047, longitude: 103.2422, level: "城市" },
  { name: "甘南", aliases: ["甘肃甘南", "甘南藏族自治州", "合作", "甘南合作"], latitude: 34.9833, longitude: 102.9110, level: "城市" },
  { name: "银川", aliases: ["宁夏银川", "银川市"], latitude: 38.4872, longitude: 106.2309, level: "城市" },
  { name: "西宁", aliases: ["青海西宁", "西宁市"], latitude: 36.6171, longitude: 101.7782, level: "城市" },
  { name: "乌鲁木齐", aliases: ["新疆乌鲁木齐", "乌市"], latitude: 43.8256, longitude: 87.6168, level: "城市" },
  { name: "南京", aliases: ["江苏南京", "南京市"], latitude: 32.0603, longitude: 118.7969, level: "城市" },
  { name: "苏州", aliases: ["江苏苏州", "苏州市"], latitude: 31.2989, longitude: 120.5853, level: "城市" },
  { name: "杭州", aliases: ["浙江杭州", "杭州市"], latitude: 30.2741, longitude: 120.1551, level: "城市" },
  { name: "宁波", aliases: ["浙江宁波", "宁波市"], latitude: 29.8683, longitude: 121.5440, level: "城市" },
  { name: "合肥", aliases: ["安徽合肥", "合肥市"], latitude: 31.8206, longitude: 117.2272, level: "城市" },
  { name: "福州", aliases: ["福建福州", "福州市"], latitude: 26.0745, longitude: 119.2965, level: "城市" },
  { name: "厦门", aliases: ["福建厦门", "厦门市"], latitude: 24.4798, longitude: 118.0894, level: "城市" },
  { name: "南昌", aliases: ["江西南昌", "南昌市"], latitude: 28.6820, longitude: 115.8579, level: "城市" },
  { name: "武汉", aliases: ["湖北武汉", "武汉市"], latitude: 30.5928, longitude: 114.3055, level: "城市" },
  { name: "长沙", aliases: ["湖南长沙", "长沙市"], latitude: 28.2282, longitude: 112.9388, level: "城市" },
  { name: "广州", aliases: ["广东广州", "广州市"], latitude: 23.1291, longitude: 113.2644, level: "城市" },
  { name: "深圳", aliases: ["广东深圳", "深圳市"], latitude: 22.5431, longitude: 114.0579, level: "城市" },
  { name: "珠海", aliases: ["广东珠海", "珠海市"], latitude: 22.2707, longitude: 113.5767, level: "城市" },
  { name: "南宁", aliases: ["广西南宁", "南宁市"], latitude: 22.8170, longitude: 108.3669, level: "城市" },
  { name: "海口", aliases: ["海南海口", "海口市"], latitude: 20.0440, longitude: 110.1999, level: "城市" },
  { name: "成都", aliases: ["四川成都", "成都市"], latitude: 30.5728, longitude: 104.0668, level: "城市" },
  { name: "贵阳", aliases: ["贵州贵阳", "贵阳市"], latitude: 26.6470, longitude: 106.6302, level: "城市" },
  { name: "昆明", aliases: ["云南昆明", "昆明市"], latitude: 25.0389, longitude: 102.7183, level: "城市" },
  { name: "拉萨", aliases: ["西藏拉萨", "拉萨市"], latitude: 29.6520, longitude: 91.1721, level: "城市" },
  { name: "香港", aliases: ["香港特别行政区"], latitude: 22.3193, longitude: 114.1694, level: "特别行政区" },
  { name: "澳门", aliases: ["澳门特别行政区"], latitude: 22.1987, longitude: 113.5439, level: "特别行政区" },
  { name: "台北", aliases: ["台湾台北", "台北市"], latitude: 25.0330, longitude: 121.5654, level: "城市" }
];

function normalizePlace(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[省市区县]/g, "")
    .toLowerCase();
}

function scorePlace(query, place) {
  const normalizedQuery = normalizePlace(query);
  if (!normalizedQuery) return 0;
  const candidates = [place.name, ...(place.aliases || [])].map(normalizePlace);
  let best = 0;
  for (const candidate of candidates) {
    if (candidate === normalizedQuery) best = Math.max(best, 100);
    else if (normalizedQuery.includes(candidate)) {
      const specificity = Math.min(8, candidate.length);
      best = Math.max(best, 90 + specificity);
    }
    else if (candidate.includes(normalizedQuery)) best = Math.max(best, 84);
  }
  if (place.level === "省份" && normalizedQuery.length > normalizePlace(place.name).length) {
    best -= 25;
  }
  return best;
}

export function geocodePlace(query, limit = 5) {
  const matches = PLACES
    .map((place) => ({ ...place, score: scorePlace(query, place) }))
    .filter((place) => place.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, limit);
  return matches.map(({ name, latitude, longitude, level, score }) => ({
    name,
    latitude,
    longitude,
    level,
    score
  }));
}
