/** Learn > Video library: the curated Fidelity videos, searchable by text and topic. */

import { Component, computed, signal } from '@angular/core';
import { VideoCard } from '../video-card/video-card';
import { FIDELITY_CHANNEL_URL, VIDEOS, VIDEO_TOPICS, VideoTopic, searchVideos } from '../videos';

@Component({
  selector: 'app-video-library',
  imports: [VideoCard],
  templateUrl: './video-library.html',
  styleUrl: './video-library.css',
})
export class VideoLibrary {
  readonly topics = VIDEO_TOPICS;
  readonly channelUrl = FIDELITY_CHANNEL_URL;
  readonly videoQuery = signal('');
  readonly videoTopic = signal<VideoTopic | null>(null);
  readonly playingId = signal<string | null>(null);

  readonly videos = computed(() => searchVideos(VIDEOS, this.videoQuery(), this.videoTopic()));

  toggleTopic(topic: VideoTopic): void {
    this.videoTopic.update((current) => (current === topic ? null : topic));
  }

  clearVideoSearch(): void {
    this.videoQuery.set('');
    this.videoTopic.set(null);
  }
}
