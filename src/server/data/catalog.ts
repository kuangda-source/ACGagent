import type { WorkDetail } from "@/lib/types";

export const demoAnimeCatalog: WorkDetail[] = [
  {
    id: "anime-frieren",
    type: "ANIME",
    title: "Frieren: Beyond Journey's End",
    description: "在旅途终点之后重新理解羁绊、告别与时间的余韵。",
    releaseYear: 2023,
    episodeCount: 28,
    creator: "Kanehito Yamada / Tsukasa Abe",
    publisher: "Madhouse",
    genres: ["fantasy", "journey", "healing", "character drama"],
    platforms: ["Crunchyroll", "Bilibili"],
    aliases: ["葬送的芙莉莲", "Frieren", "Sousou no Frieren"],
    ratings: [
      { source: "ANILIST", value: 8.9, scale: 10, votes: 195000, url: "https://anilist.co/anime/154587" },
      { source: "MAL", value: 9.3, scale: 10, votes: 450000, url: "https://myanimelist.net/anime/52991" },
      { source: "IMDB", value: 8.8, scale: 10, votes: 43000, url: "https://www.imdb.com/title/tt22248376/" }
    ],
    officialResources: [
      { label: "AniList", url: "https://anilist.co/anime/154587", type: "encyclopedia" },
      { label: "MAL", url: "https://myanimelist.net/anime/52991", type: "encyclopedia" },
      { label: "Official", url: "https://frieren-anime.jp/", type: "official" }
    ]
  },
  {
    id: "anime-bocchi",
    type: "ANIME",
    title: "Bocchi the Rock!",
    description: "社恐少女在乐队中找到表达方式的成长喜剧。",
    releaseYear: 2022,
    episodeCount: 12,
    creator: "Aki Hamaji",
    publisher: "CloverWorks",
    genres: ["music", "comedy", "slice of life", "growth"],
    platforms: ["Crunchyroll", "Bilibili"],
    aliases: ["孤独摇滚", "BTR", "Bocchi"],
    ratings: [
      { source: "ANILIST", value: 8.7, scale: 10, votes: 220000, url: "https://anilist.co/anime/130003" },
      { source: "MAL", value: 8.8, scale: 10, votes: 340000, url: "https://myanimelist.net/anime/47917" }
    ],
    officialResources: [
      { label: "AniList", url: "https://anilist.co/anime/130003", type: "encyclopedia" },
      { label: "Official", url: "https://bocchi.rocks/", type: "official" }
    ]
  },
  {
    id: "anime-blue-archive",
    type: "ANIME",
    title: "Blue Archive The Animation",
    description: "学院都市 Kivotos 的群像冒险，节奏轻快。",
    releaseYear: 2024,
    episodeCount: 12,
    creator: "Yostar Pictures",
    publisher: "Yostar",
    genres: ["school", "action", "ensemble"],
    platforms: ["Crunchyroll"],
    aliases: ["蔚蓝档案", "Blue Archive"],
    ratings: [
      { source: "ANILIST", value: 7.2, scale: 10, votes: 18000, url: "https://anilist.co/anime/161482" },
      { source: "MAL", value: 6.7, scale: 10, votes: 12000, url: "https://myanimelist.net/anime/54309" }
    ],
    officialResources: [
      { label: "AniList", url: "https://anilist.co/anime/161482", type: "encyclopedia" },
      { label: "Official", url: "https://sh-anime.shochiku.co.jp/bluearchive-anime/", type: "official" }
    ]
  }
];

export const demoGameCatalog: WorkDetail[] = [
  {
    id: "game-persona-5-royal",
    type: "GAME",
    title: "Persona 5 Royal",
    description: "都市日常与异世界攻略交织的长线 JRPG。",
    releaseYear: 2022,
    creator: "P-Studio",
    publisher: "SEGA",
    genres: ["jrpg", "stylish", "social sim", "turn-based"],
    platforms: ["PC", "Steam", "Xbox", "Switch"],
    aliases: ["P5R", "女神异闻录5 皇家版", "Persona 5"],
    ratings: [
      { source: "STEAM", value: 9.7, scale: 10, votes: 56000, label: "好评如潮", url: "https://store.steampowered.com/app/1687950" },
      { source: "IMDB", value: 8.7, scale: 10, votes: 3300, url: "https://www.imdb.com/title/tt23730070/" }
    ],
    officialResources: [
      { label: "Steam", url: "https://store.steampowered.com/app/1687950", type: "store" },
      { label: "Official", url: "https://asia.sega.com/p5r/cht/", type: "official" }
    ],
    currentPrice: 219,
    originalPrice: 329,
    lowestPrice: 164,
    currency: "CNY",
    reviewSummary: "剧情和风格化演出稳定，适合喜欢角色驱动叙事的玩家。"
  },
  {
    id: "game-atelier-ryza-3",
    type: "GAME",
    title: "Atelier Ryza 3",
    description: "以炼金与探索循环为核心的轻冒险 JRPG。",
    releaseYear: 2023,
    creator: "Gust",
    publisher: "KOEI TECMO",
    genres: ["jrpg", "crafting", "healing", "adventure"],
    platforms: ["PC", "Steam", "PS5", "Switch"],
    aliases: ["莱莎的炼金工房3", "Ryza 3"],
    ratings: [{ source: "STEAM", value: 8.6, scale: 10, votes: 7200, label: "特别好评", url: "https://store.steampowered.com/app/1999770" }],
    officialResources: [
      { label: "Steam", url: "https://store.steampowered.com/app/1999770", type: "store" },
      { label: "Official", url: "https://www.koeitecmoamerica.com/ryza3/", type: "official" }
    ],
    currentPrice: 349,
    originalPrice: 349,
    lowestPrice: 244,
    currency: "CNY",
    reviewSummary: "探索与合成节奏轻松，偏治愈向。"
  },
  {
    id: "game-tales-of-arise",
    type: "GAME",
    title: "Tales of Arise",
    description: "战斗流畅的动作 JRPG，注重伙伴羁绊与主线推进。",
    releaseYear: 2021,
    creator: "Bandai Namco Studios",
    publisher: "Bandai Namco",
    genres: ["jrpg", "action", "party", "story rich"],
    platforms: ["PC", "Steam", "PS5", "Xbox"],
    aliases: ["破晓传奇", "TOA", "Tales"],
    ratings: [{ source: "STEAM", value: 9.1, scale: 10, votes: 26000, label: "特别好评", url: "https://store.steampowered.com/app/740130" }],
    officialResources: [
      { label: "Steam", url: "https://store.steampowered.com/app/740130", type: "store" },
      { label: "Official", url: "https://en.bandainamcoent.eu/tales-of-arise", type: "official" }
    ],
    currentPrice: 298,
    originalPrice: 298,
    lowestPrice: 149,
    currency: "CNY",
    reviewSummary: "动作手感与过场表现突出。"
  }
];

export const allDemoWorks: WorkDetail[] = [...demoAnimeCatalog, ...demoGameCatalog];
