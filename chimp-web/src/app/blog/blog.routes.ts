import { Routes } from "@angular/router";
import { BlogIndexComponent } from "./blog-index/blog-index.component";
import { BlogPostComponent } from "./blog-post/blog-post.component";

export const blogRoutes: Routes = [
  { path: "", component: BlogIndexComponent },
  { path: ":slug", component: BlogPostComponent }
];
