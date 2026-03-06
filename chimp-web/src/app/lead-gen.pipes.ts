import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'missingCount', standalone: true })
export class MissingCountPipe implements PipeTransform {
  transform(violations: Array<{ status?: string }> | null | undefined): number {
    return violations?.filter(violation => violation.status === 'likely_missing').length ?? 0;
  }
}

@Pipe({ name: 'dateFormat', standalone: true })
export class DateFormatPipe implements PipeTransform {
  transform(timestamp: any): string {
    if (!timestamp) {
      return '—';
    }
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

@Pipe({ name: 'industryLabel', standalone: true })
export class IndustryLabelPipe implements PipeTransform {
  transform(industry: string | undefined): string {
    return industry?.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) ?? '';
  }
}
