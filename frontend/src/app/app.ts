import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IdleDialog } from './auth/idle-dialog';
@Component({ selector: 'app-root', imports: [RouterOutlet, IdleDialog], templateUrl: './app.html' })
export class App {}

