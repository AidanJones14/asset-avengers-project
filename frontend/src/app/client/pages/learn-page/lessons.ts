/** Static investing basics shown on the Learn page. General education only. */

export interface Lesson {
  title: string;
  summary: string;
  points: readonly string[];
  /** A related video from VIDEOS (videos.ts), shown under the points. */
  videoId?: string;
}

export const LESSONS: readonly Lesson[] = [
  {
    title: 'Diversification',
    videoId: 'MZchH0Ddzn8',
    summary: 'Don’t put all your eggs in one basket.',
    points: [
      'Spread your money across many companies, sectors and, ideally, asset types.',
      'Broad index funds and ETFs give instant diversification in a single purchase.',
      'Diversification lowers the damage any one company can do, but cannot remove market wide risk.',
    ],
  },
  {
    title: 'Risk, return and time horizon',
    videoId: 'L91FRxNkglk',
    summary: 'Higher potential returns come with bigger swings.',
    points: [
      'Stocks can fall sharply in the short term; the longer you can wait, the more time you have to recover.',
      'Money you need within a few years is usually better kept somewhere less volatile.',
      'Only invest what you could leave untouched through a downturn.',
    ],
  },
  {
    title: 'Market, limit, stop and stop-limit orders',
    videoId: 'sT-tvc8GPQQ',
    summary: 'Choose how and when your trade executes.',
    points: [
      'Market orders fill quickly at the current price, which can move before your order executes.',
      'Limit orders only fill at your price or better, but may never fill.',
      'Stop orders trigger once a price is reached, often used to limit losses on a position.',
      'Stop-limit orders combine the features of stop and limit orders, triggering a limit order once a specified price is reached.',
    ],
  },
  {
    title: 'Dollar-cost averaging',
    videoId: 'DojGdOFPZyE',
    summary: 'Invest a fixed amount on a regular schedule.',
    points: [
      'Buying regularly means you buy more shares when prices are low and fewer when they are high.',
      'It removes the pressure of trying to time the market.',
      'Consistency usually matters more than picking the perfect day to buy.',
    ],
  },
  {
    title: 'Build an emergency fund first',
    videoId: 'gj9WJ8ZXtVk',
    summary: 'Keep a cash cushion before you invest.',
    points: [
      'A common guideline is three to six months of essential expenses in easy-to-access savings.',
      'It stops you being forced to sell investments at a bad time to cover a surprise bill.',
      'Paying off high-interest debt is often a better “return” than investing.',
    ],
  },
  {
    title: 'Fees, compounding and staying the course',
    videoId: 'DBQqWx4el-Q',
    summary: 'Small costs and patience add up over time.',
    points: [
      'Returns on investments compound over time: the earlier you start, the more compounding helps.',
      'Fees and frequent trading quietly eat into that growth.',
      'Panic selling during a dip locks in losses; have a plan and stick to it.',
    ],
  },
];
