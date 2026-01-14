import { Component, OnInit, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SignUpComponent } from '../sign-up/sign-up.component';
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  standalone: true,
  selector: 'app-how',
  templateUrl: './how.component.html',
  styleUrls: ['./how.component.css'],
  imports: [CommonModule, MatIconModule, SignUpComponent],
  animations: [
    trigger('scrollAnimation', [
      state('show', style({
        opacity: 1,
        transform: "translateX(0)"
      })),
      state('hide', style({
        opacity: 0,
        transform: "translateX(-100%)"
      })),
      transition('show => hide', animate('700ms ease-out')),
      transition('hide => show', animate('700ms ease-in'))
    ])
  ]
})
export class HowComponent {

  state = 'show'

  constructor(public el: ElementRef) { }

  @HostListener('window:scroll') // TODO: FIX ME
  onWindowScroll() {
      const componentPosition = this.el.nativeElement.offsetTop
      const scrollPosition = window.pageYOffset

      if (scrollPosition >= componentPosition) {
        console.log('hit');
        
        this.state = 'show'
      } else {
        console.log('hiiit');
        this.state = 'hide'
      }

    }

}
