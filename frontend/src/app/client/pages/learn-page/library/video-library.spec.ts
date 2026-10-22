import { TestBed } from '@angular/core/testing';
import { VIDEOS } from '../videos';
import { VideoLibrary } from './video-library';

describe('Video library', () => {
  it('lists every curated video and filters by search and topic', () => {
    const page = TestBed.runInInjectionContext(() => new VideoLibrary());
    expect(page.videos().length).toBe(VIDEOS.length);
    page.videoQuery.set('technical analysis');
    expect(page.videos().map((v) => v.id)).toContain('_QQeKgPnOKw');
    page.clearVideoSearch();
    page.toggleTopic('Crypto');
    expect(page.videos().every((v) => v.topics.includes('Crypto'))).toBe(true);
  });
});
