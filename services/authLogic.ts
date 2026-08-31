import { User } from '../types';

export const hashPassword = async (password: string): Promise<string> => {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const isDemoEmail = (email: string) =>
  email === 'admin@calcarioflow.com.br' || email === 'admin' || email.endsWith('@calcarioflow.com.br');

export const toPublicUser = (user: User): User => {
  const { passwordHash: _hash, ...safe } = user;
  return safe;
};

export const passwordMatches = async (user: User, pass: string): Promise<boolean> => {
  if (!pass) return false;
  if (user.passwordHash) {
    return (await hashPassword(pass)) === user.passwordHash;
  }
  // Contas antigas / demo sem hash ainda aceitam a senha provisória.
  return pass === '123456';
};
