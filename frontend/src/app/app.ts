import { Component, inject } from '@angular/core';
import { ThemeService } from './shared/theme/theme.service';
import { RouterOutlet } from '@angular/router';
import { IdleDialog } from './auth/idle-dialog';
@Component({ selector: 'app-root', imports: [RouterOutlet, IdleDialog], templateUrl: './app.html' })
export class App { private readonly theme = inject(ThemeService); }

