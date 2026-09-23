import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index.js';

describe('APP_NAME', () => {
  it('is ValueSkins', () => {
    expect(APP_NAME).toBe('ValueSkins');
  });
});
