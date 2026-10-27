/**
 * Bootstraps the client application. appConfig restores authentication and wires
 * HTTP/router providers before the root component displays guarded client pages.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
