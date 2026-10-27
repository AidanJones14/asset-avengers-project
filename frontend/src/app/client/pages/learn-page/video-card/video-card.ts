/** One Learn page video: a thumbnail button that swaps in the YouTube player while playing. */

import { Component, computed, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Video } from '../videos';

@Component({
  selector: 'app-video-card',
  templateUrl: './video-card.html',
  styleUrl: './video-card.css',
  host: { '[class.row]': "layout() === 'row'" },
})
export class VideoCard {
  private readonly sanitizer = inject(DomSanitizer);
  readonly video = input.required<Video>();
  /** 'card' for grids; 'row' is a compact thumbnail-beside-title layout (used inside tips). */
  readonly layout = input<'card' | 'row'>('card');
  readonly playing = input(false);
  readonly play = output<void>();
  readonly stop = output<void>();

  readonly meta = computed(() => this.video().series ?? this.video().topics.join(' · '));
  // Ids come from the curated catalog in videos.ts (checked to be 11-character YouTube ids).
  readonly embedUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(this.video().id)}?autoplay=1&rel=0`,
    ),
  );
}
