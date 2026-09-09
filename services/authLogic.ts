import { User } from '../types';

export const isDemoEmail = (email: string) =>
  email === 'admin@calcarioflow.com.br' || email === 'admin' || email.endsWith('@calcarioflow.com.br');

export const toPublicUser = (user: User): User => user;
