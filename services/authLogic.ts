import { User } from '../types';

export const isDemoEmail = (email: string) =>
  email === 'admin@calcarioflow.com.br' || email === 'admin' || email.endsWith('@calcarioflow.com.br');

export const isLocalDevHost = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

export const toPublicUser = (user: User): User => user;
