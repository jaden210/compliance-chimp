import { Pipe, PipeTransform } from "@angular/core";
import { Article } from "../training.service";

@Pipe({
  standalone: true,
  name: "surveySearch"
})
export class ArticlesSearchPipe implements PipeTransform {
  transform(articles: Article[], args?: string, people?) {
    let filter: string[] = args ? args.trim().split(/\s+/) : null;
    let rv: any[] = [];

    if (filter) {
      // loop variable
      cardLoop: for (let article of articles) {
        for (let f of filter) {
          // for value of filter array, built from arguments passed in
          if (article.name.toLowerCase().includes(f.toLowerCase())) {
            // convert to lower case, compare keyword to f
            rv.push(article); // append matching store to results[]
            continue cardLoop; // if block true, run filters loop again
          }
        }
      }
      return rv;
    } else if (people) {
      if (people.length > 0) {
        for (let person of people) {
          for (let article of articles) {
            Object.keys(article.myContent.shouldReceiveTraining).forEach(
              key => {
                if (key == person) {
                  rv.push(article);
                }
              }
            );
          }
        }
        return rv;
      } else {
        return articles; // empty args returns whole stores list
      }
    } else {
      return articles; // empty args returns whole stores list
    }
  }
}
