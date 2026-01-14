import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AccountService } from '../../account.service';
import { Observable } from 'rxjs';
import { SupportService } from '../support.service';

@Component({
  standalone: true,
  selector: 'app-view-blogs',
  templateUrl: './view-blogs.component.html',
  styleUrls: ['./view-blogs.component.css'],
  imports: [
    CommonModule,
    MatListModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class BlogsComponent implements OnInit {

  blogs: Observable<any>;

  constructor(
    public accountService: AccountService,
    public supportService: SupportService
  ) { }

  ngOnInit() {
    this.blogs = this.supportService.getBlogs();
  }

  newBlog() {
    this.supportService.makeBlog = true;
  }

  editBlog(blog) {
    this.supportService.makeBlog = true;
    this.supportService.blog = blog;
  }

}