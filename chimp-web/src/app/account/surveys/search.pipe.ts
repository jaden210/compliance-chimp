import { Pipe, PipeTransform } from "@angular/core";
import { Survey } from "../survey/survey";

@Pipe({
  standalone: true,
  name: "surveySearch"
})
export class SurveySearchPipe implements PipeTransform {
  transform(surveys: Survey[], args?: string, people?) {
    let filter: string[] = args ? args.trim().split(/\s+/) : null;
    let rv: any[] = [];

    if (filter) {
      // loop variable
      cardLoop: for (let survey of surveys) {
        for (let f of filter) {
          // for value of filter array, built from arguments passed in
          if (survey.category.toLowerCase().includes(f.toLowerCase())) {
            // convert to lower case, compare keyword to f
            rv.push(survey); // append matching store to results[]
            continue cardLoop; // if block true, run filters loop again
          }
          if (survey.title.toLowerCase().includes(f.toLowerCase())) {
            // convert to lower case, compare keyword to f
            rv.push(survey); // append matching store to results[]
            continue cardLoop; // if block true, run filters loop again
          }
        }
      }
      return rv;
    } else if (people) {
      if (people.length > 0) {
        for (let person of people) {
          for (let survey of surveys) {
            Object.keys(survey.userSurvey).forEach(key => {
              if (key == person) {
                rv.push(survey);
              }
            });
          }
        }
        return rv;
      } else {
        return surveys; // empty args returns whole stores list
      }
    } else {
      return surveys; // empty args returns whole stores list
    }
  }
}
