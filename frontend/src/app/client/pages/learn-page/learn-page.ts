/**
 * Educational tab shell: the page frame plus Overview / Video library sub-tabs,
 * each a child route (/client/learn and /client/learn/videos).
 */

import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageFrame } from '../../components/page-frame/page-frame';

@Component({
  selector: 'app-learn-page',
  imports: [PageFrame, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './learn-page.html',
  styleUrl: './learn-page.css',
})
export class LearnPage {}
