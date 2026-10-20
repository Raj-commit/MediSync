import { fakeJwt } from './testing';
import { isTokenExpired } from './jwt';

describe('isTokenExpired', () => {
  it('is false for a token that expires in the future', () => {
    expect(isTokenExpired(fakeJwt(3600))).toBe(false);
  });

  it('is true for a token whose expiry has passed', () => {
    expect(isTokenExpired(fakeJwt(-10))).toBe(true);
  });

  it('is false when the token has no readable expiry', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(false);
    expect(isTokenExpired('a.b.c')).toBe(false);
  });
});
