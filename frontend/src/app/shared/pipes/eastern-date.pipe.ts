import { Pipe, PipeTransform } from '@angular/core';
import { formatDate } from '@angular/common';

@Pipe({ name: 'easternDate' })
export class EasternDatePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, format = 'medium'): string | null {
    if (value == null || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    // Resolve the offset for this observation, so summer/winter use EDT/EST correctly.
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', timeZoneName: 'longOffset',
    }).formatToParts(date).find(part => part.type === 'timeZoneName')!.value.replace('GMT', '').replace(':', '');
    return formatDate(date, format, 'en-US', offset) + ' ET';
  }
}
