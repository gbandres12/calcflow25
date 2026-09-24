import { User } from '../types';

export const isDemoEmail = (email: string) =>
  email === 'admin@calcarioflow.com.br' || email === 'admin' || email.endsWith('@calcarioflow.com.br');

export const isLocalDevHost = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

export const toPublicUser = (user: User): User => user;

export function visibleCompanyUsers(users: User[], currentUser?: User | null): User[] {
  const list = (Array.isArray(users) ? users : []).filter((user) => user && (user.id || user.email));
  if (!currentUser) return list;

  const currentEmail = String(currentUser.email || '').trim().toLowerCase();
  const index = list.findIndex((user) =>
    (currentUser.id && user.id === currentUser.id) ||
    (currentEmail && String(user.email || '').trim().toLowerCase() === currentEmail)
  );

  if (index === -1) {
    return [currentUser, ...list];
  }

  const merged = {
    ...currentUser,
    ...list[index],
    id: currentUser.id || list[index].id,
    email: currentUser.email || list[index].email,
    name: currentUser.name || list[index].name,
    role: list[index].role || currentUser.role
  };
  return list.map((user, position) => (position === index ? merged : user));
}
