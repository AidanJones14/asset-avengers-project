import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationSidebar } from '../components/navigation-sidebar/navigation-sidebar';

@Component({
  selector: 'app-client-layout',
  imports: [RouterOutlet, NavigationSidebar],
  templateUrl: './client-layout.html',
  styleUrl: './client-layout.css',
})
export class ClientLayout {}
