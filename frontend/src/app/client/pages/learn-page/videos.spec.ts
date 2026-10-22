import { LESSONS } from './lessons';
import { STARTER_VIDEO_IDS, TIP_VIDEO_IDS, VIDEOS, Video, searchVideos } from './videos';

const catalog: Video[] = [
  { id: 'a', title: 'Bond basics', duration: '1:00', topics: ['Bonds & rates'] },
  { id: 'b', title: 'Roth IRA Explained', series: 'Women Talk Money', duration: '1:00', topics: ['Retirement'], keywords: ['taxes'] },
  { id: 'c', title: 'Why retirees buy bonds', duration: '1:00', topics: ['Retirement', 'Bonds & rates'] },
];

describe('searchVideos', () => {
  it('returns everything for an empty query', () => {
    expect(searchVideos(catalog, '  ').map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('matches keywords, series and topics, ignoring case and punctuation', () => {
    expect(searchVideos(catalog, 'TAXES').map((v) => v.id)).toEqual(['b']);
    expect(searchVideos(catalog, 'women talk').map((v) => v.id)).toEqual(['b']);
    expect(searchVideos(catalog, 'roth-ira').map((v) => v.id)).toEqual(['b']);
  });

  it('requires every term and ranks title matches first', () => {
    expect(searchVideos(catalog, 'retirement bonds').map((v) => v.id)).toEqual(['c']);
    expect(searchVideos(catalog, 'retire').map((v) => v.id)).toEqual(['c', 'b']);
  });

  it('filters by topic', () => {
    expect(searchVideos(catalog, '', 'Retirement').map((v) => v.id)).toEqual(['b', 'c']);
    expect(searchVideos(catalog, 'bond', 'Retirement').map((v) => v.id)).toEqual(['c']);
  });

  it('ships a catalog with unique, valid YouTube ids', () => {
    const ids = VIDEOS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[\w-]{11}$/.test(id))).toBe(true);
  });
});

describe('curated catalog links', () => {
  it('has every starter and tip video in the bundled catalog', () => {
    expect(STARTER_VIDEO_IDS.every((id) => VIDEOS.some((v) => v.id === id))).toBe(true);
    expect(Object.values(TIP_VIDEO_IDS).every((id) => VIDEOS.some((v) => v.id === id))).toBe(true);
  });

  it('has every lesson video in the bundled catalog', () => {
    expect(LESSONS.every((lesson) => !lesson.videoId || VIDEOS.some((v) => v.id === lesson.videoId))).toBe(true);
  });

  it('has a video for every tip investingTips can show', () => {
    expect(Object.keys(TIP_VIDEO_IDS).sort()).toEqual(['concentration', 'diversified', 'diversify', 'idle-cash', 'unfunded', 'uninvested']);
  });
});
