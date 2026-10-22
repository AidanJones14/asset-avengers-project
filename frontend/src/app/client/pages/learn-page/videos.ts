/**
 * Educational videos from the Fidelity Investments YouTube channel
 * (https://www.youtube.com/@fidelityinvestments/videos), searched client-side on
 * the Learn page. Curated by hand: to add one, copy its id from the YouTube URL
 * and fill in the title, series, duration, topics and search keywords.
 */

export type VideoTopic =
  | 'Retirement'
  | 'Stocks'
  | 'Bonds & rates'
  | 'ETFs & funds'
  | 'Crypto'
  | 'Trading'
  | 'Planning'
  | 'Security';

export interface Video {
  id: string;
  title: string;
  series?: string;
  duration?: string;
  topics: readonly VideoTopic[];
  keywords?: readonly string[];
}

export const VIDEO_TOPICS: readonly VideoTopic[] = [
  'Retirement',
  'Stocks',
  'Bonds & rates',
  'ETFs & funds',
  'Crypto',
  'Trading',
  'Planning',
  'Security',
];

/** Short beginner videos shown first on the Learn page. */
export const STARTER_VIDEO_IDS: readonly string[] = ['xSzUREJlYvY', 'ryPU_bW-8vU', '_QQeKgPnOKw'];

export const FIDELITY_CHANNEL_URL = 'https://www.youtube.com/@fidelityinvestments/videos';

/** Newest first. */
export const VIDEOS: readonly Video[] = [
  { id: 'XWWCglpVEpo', title: 'What Works In A Volatile Stock Market?', series: 'In The Money', duration: '31:14', topics: ['Stocks', 'Trading'], keywords: ['volatility', 'market outlook'] },
  { id: 'PXN3L4JjCbI', title: 'Are You Counting On Social Security In Retirement?', duration: '5:18', topics: ['Retirement', 'Planning'], keywords: ['social security', 'income'] },
  { id: 'DKn9d3HSgGY', title: 'The Biggest Retirement Savings Myth', series: 'Money Unscripted', duration: '15:41', topics: ['Retirement', 'Planning'], keywords: ['saving', '401k'] },
  { id: '0LJQQYStfkU', title: 'Trading Ideas When Interest Rates Are High', series: 'In The Money', duration: '31:26', topics: ['Trading', 'Bonds & rates'], keywords: ['interest rates', 'fed'] },
  { id: '_qfsYslaVuk', title: 'Should You Buy Dividend Stocks Right Now?', duration: '9:55', topics: ['Stocks'], keywords: ['dividends', 'income', 'yield'] },
  { id: 'ArF79I6eXRI', title: 'This Has Happened To Stocks 95% Of The Time After Midterms', series: 'Market Sense', duration: '25:52', topics: ['Stocks'], keywords: ['elections', 'midterms', 'history'] },
  { id: 'MwYNZPD1T8o', title: 'Could High Bond Yields Affect The Housing Market?', series: 'In The Money', duration: '30:36', topics: ['Bonds & rates'], keywords: ['housing', 'mortgage', 'yields'] },
  { id: 'jeXvfsgVH0I', title: 'How To Use A Fidelity Crypto Account', series: 'Covering Crypto', duration: '35:25', topics: ['Crypto'], keywords: ['bitcoin', 'ethereum', 'account'] },
  { id: 'qKj6vAWA8_o', title: 'Boosting Your Cybersecurity', series: '5 Questions With Fidelity', duration: '8:08', topics: ['Security'], keywords: ['passwords', 'fraud', 'cybersecurity'] },
  { id: 'qSOi5ndR_1A', title: 'How To Evaluate Your Employee Benefits', series: 'Women Talk Money', duration: '43:20', topics: ['Planning', 'Retirement'], keywords: ['401k', 'benefits', 'hsa', 'insurance'] },
  { id: 'zVlvQq8QThI', title: 'What Has Made The Fidelity Contrafund So Successful?', series: 'Market Sense', duration: '31:26', topics: ['ETFs & funds', 'Stocks'], keywords: ['mutual fund', 'active management'] },
  { id: 'IfOxAV2PA-o', title: 'How To Sign Up For Medicare', series: 'Money Unscripted', duration: '9:05', topics: ['Retirement'], keywords: ['medicare', 'health care'] },
  { id: 'gYEHrS1gP4g', title: 'How Active Trader Pro Users Can Get Started with Fidelity Trader+', duration: '59:00', topics: ['Trading'], keywords: ['platform', 'tools', 'charts'] },
  { id: 'k4nliH6dxvk', title: 'Will New Rules Help Or Hurt Bitcoin?', series: 'Covering Crypto', duration: '35:36', topics: ['Crypto'], keywords: ['bitcoin', 'regulation'] },
  { id: '55tJZXp1p60', title: 'The Biggest ETF Trends Investors Should Know Now', series: 'Market Sense', duration: '22:43', topics: ['ETFs & funds'], keywords: ['etf', 'index funds'] },
  { id: 'u6GlDH5HrzQ', title: 'When Will Oil Prices And Inflation Go Down?', series: 'In The Money', duration: '30:18', topics: ['Bonds & rates', 'Stocks'], keywords: ['inflation', 'oil', 'energy'] },
  { id: '9ijKbthHhQc', title: 'The Best Time To Buy Bonds In Years?', series: 'Market Sense', duration: '30:04', topics: ['Bonds & rates'], keywords: ['bonds', 'fixed income', 'yields'] },
  { id: 'DteXaDaQR0o', title: 'A Closer Look At The Costs Of Long Term Care', series: 'Insights Live', duration: '44:09', topics: ['Retirement', 'Planning'], keywords: ['long term care', 'health care', 'insurance'] },
  { id: 'Wvo8tfdFuhc', title: 'What To Know About Online Scams And Theft', series: '5 Questions With Fidelity', duration: '11:05', topics: ['Security'], keywords: ['scams', 'fraud', 'identity theft'] },
  { id: 'yelDkN6VW48', title: 'A Deep Dive On Health Care Costs In Retirement', series: 'Insights Live', duration: '45:19', topics: ['Retirement', 'Planning'], keywords: ['health care', 'medicare'] },
  { id: 'S9f7fnAfTfY', title: 'Solving This Could Unlock Investing Opportunities', series: 'Market Sense', duration: '23:14', topics: ['Stocks'], keywords: ['market outlook'] },
  { id: '7d6sEnVSEJA', title: 'Smart To NOT Buy Bitcoin Right Now?', series: 'Covering Crypto', duration: '31:42', topics: ['Crypto'], keywords: ['bitcoin'] },
  { id: 'xGC-DCFreQU', title: 'Should You Get A Trump Account For Kids?', duration: '9:20', topics: ['Planning'], keywords: ['kids', 'children', 'savings account'] },
  { id: 'Hd_8ZYQLej8', title: 'RMDs Explained', series: '5 Questions With Fidelity', duration: '7:44', topics: ['Retirement'], keywords: ['required minimum distributions', 'ira', 'taxes'] },
  { id: 'nLUmUWt-IK8', title: 'Roth IRA Explained: Basics & Beyond', series: 'Women Talk Money', duration: '40:48', topics: ['Retirement', 'Planning'], keywords: ['roth', 'ira', 'taxes', 'beginner'] },
  { id: '_PrJxdwDcH4', title: 'Third Quarter 2026 Quarterly Sector And Investment Research Update', duration: '3:05', topics: ['Stocks'], keywords: ['sectors', 'research', 'outlook'] },
  { id: 'p2tCbRihx3g', title: 'Who Are The New Winners In The Stock Market?', series: 'Market Sense', duration: '26:37', topics: ['Stocks'], keywords: ['sectors', 'market leaders'] },
  { id: 'xSzUREJlYvY', title: 'How To Set Goals & Build Investing Knowledge', series: 'FidQs', duration: '3:36', topics: ['Planning'], keywords: ['beginner', 'goals', 'basics'] },
  { id: '_QQeKgPnOKw', title: 'What Is Technical Analysis?', duration: '5:30', topics: ['Trading'], keywords: ['charts', 'beginner', 'indicators'] },
  { id: 'ryPU_bW-8vU', title: 'How One Investment Can Help Instantly Reduce Your Investing Risk', duration: '7:38', topics: ['ETFs & funds', 'Planning'], keywords: ['diversification', 'risk', 'index funds', 'beginner'] },
  { id: 'MZchH0Ddzn8', title: 'What Is Diversification?', duration: '6:18', topics: ['Planning', 'ETFs & funds'], keywords: ['diversification', 'risk', 'beginner'] },
  { id: 'JlOB8hZLoFU', title: 'What Are Concentrated Stock Positions?', series: '5 Questions With Fidelity', duration: '8:57', topics: ['Stocks', 'Planning'], keywords: ['concentration', 'single stock', 'risk'] },
  { id: 'DojGdOFPZyE', title: 'What Is Dollar-Cost Averaging?', duration: '4:18', topics: ['Planning'], keywords: ['dca', 'recurring investments', 'market timing', 'beginner'] },
  { id: 'R_FOYG3KHdo', title: 'What Is Asset Allocation?', duration: '4:37', topics: ['Planning', 'ETFs & funds'], keywords: ['rebalancing', 'diversification', 'risk', 'beginner'] },
  { id: 'vbelTo4QvK4', title: 'How To Start Investing', duration: '5:18', topics: ['Planning'], keywords: ['getting started', 'basics', 'emergency fund', 'beginner'] },
  { id: 'L91FRxNkglk', title: 'Understanding Risk Tolerance', duration: '1:03', topics: ['Planning'], keywords: ['risk', 'time horizon', 'volatility', 'beginner'] },
  { id: 'sT-tvc8GPQQ', title: 'Market Orders vs. Limit Orders', duration: '1:21', topics: ['Trading'], keywords: ['order types', 'market order', 'limit order', 'beginner'] },
  { id: 'gj9WJ8ZXtVk', title: 'Short-Term Investment Options For Your Cash', series: 'Money Unscripted', duration: '8:15', topics: ['Planning'], keywords: ['emergency fund', 'cash', 'savings', 'money market'] },
  { id: 'DBQqWx4el-Q', title: 'How To Avoid Emotional Investing', series: '5 Questions With Fidelity', duration: '7:30', topics: ['Planning'], keywords: ['panic selling', 'staying the course', 'volatility', 'behavior'] },
  { id: 'rLBdIOikjz8', title: 'How To Buy Stocks, ETFs, And Mutual Funds', duration: '4:22', topics: ['Stocks', 'ETFs & funds'], keywords: ['first trade', 'mutual funds', 'index funds', 'beginner'] },
];

/** The video shown with each portfolio tip, keyed by InvestingTip id (state/investing-tips.ts). */
export const TIP_VIDEO_IDS: Readonly<Record<string, string>> = {
  unfunded: 'vbelTo4QvK4',
  uninvested: 'rLBdIOikjz8',
  concentration: 'JlOB8hZLoFU',
  diversify: 'MZchH0Ddzn8',
  'idle-cash': 'DojGdOFPZyE',
  diversified: 'R_FOYG3KHdo',
};

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Every query word must appear in the video's title, series, topics or keywords.
 * Title matches rank first; ties keep catalog (newest-first) order.
 */
export function searchVideos(videos: readonly Video[], query: string, topic: VideoTopic | null = null): Video[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  const pool = topic ? videos.filter((video) => video.topics.includes(topic)) : videos;
  if (!terms.length) return [...pool];

  return pool
    .map((video, index) => {
      const title = normalize(video.title);
      const rest = normalize([video.series ?? '', ...video.topics, ...(video.keywords ?? [])].join(' '));
      if (!terms.every((term) => title.includes(term) || rest.includes(term))) return null;
      return { video, index, score: terms.filter((term) => title.includes(term)).length };
    })
    .filter((hit) => hit !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((hit) => hit.video);
}
