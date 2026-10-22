/**
 * Learn > Overview: starter videos, rule-based tips computed from PortfolioStore,
 * and static investing basics, each with a related video. Read-only.
 */

import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortfolioStore } from '../../../state/portfolio.store';
import { investingTips } from '../../../state/investing-tips';
import { LESSONS } from '../lessons';
import { VideoCard } from '../video-card/video-card';
import { STARTER_VIDEO_IDS, TIP_VIDEO_IDS, VIDEOS, Video } from '../videos';

@Component({
  selector: 'app-learn-overview',
  imports: [RouterLink, VideoCard],
  templateUrl: './learn-overview.html',
  styleUrl: './learn-overview.css',
})
export class LearnOverview {
  private readonly store = inject(PortfolioStore);
  readonly lessons = LESSONS;
  // Bundled videos by id, for the starter, tip and lesson videos.
  readonly videoById = new Map(VIDEOS.map((video) => [video.id, video]));
  readonly starterVideos = STARTER_VIDEO_IDS.map((id) => this.videoById.get(id)).filter(
    (video): video is Video => !!video,
  );
  readonly tipVideos = new Map(
    Object.entries(TIP_VIDEO_IDS).flatMap(([tipId, videoId]) => {
      const video = this.videoById.get(videoId);
      return video ? [[tipId, video] as const] : [];
    }),
  );
  // "<section>:<id>", so a video shown in two sections only plays where it was clicked.
  readonly playingKey = signal<string | null>(null);
  readonly tips = computed(() =>
    investingTips({ holdings: this.store.holdings(), cashBalance: this.store.cashBalance() }),
  );

  // A closed <details> only hides its content, so stop a lesson video that is still playing.
  onLessonToggle(event: Event, lessonTitle: string): void {
    if (!(event.target as HTMLDetailsElement).open && this.playingKey() === 'lesson:' + lessonTitle) {
      this.playingKey.set(null);
    }
  }
}
