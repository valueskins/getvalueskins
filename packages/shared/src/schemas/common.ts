import { z } from 'zod';
import { isValidCalendarDateString } from '../dealStateMachine.js';

export const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD calendar date string, e.g. a deal deadline. */
export const dateStringSchema = z
  .string()
  .regex(CALENDAR_DATE_REGEX, 'Expected a date in YYYY-MM-DD format')
  .refine(isValidCalendarDateString, { message: 'Not a valid calendar date' });
