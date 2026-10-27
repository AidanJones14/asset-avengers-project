import type { AccessClaims } from './auth.service';

export function clientProfile(claims: AccessClaims | null, email = '') {
  const given = claims?.given_name?.trim() || '';
  const family = claims?.family_name?.trim() || '';
  const name = claims?.name?.trim() || [given, family].filter(Boolean).join(' ');
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    name: name || claims?.email || email || 'Your account',
    firstName: given || parts[0] || '',
    email: claims?.email || email,
    initials: name ? [parts[0], ...(parts.length > 1 ? [parts[parts.length - 1]] : [])]
      .map(part => Array.from(part)[0]).join('').toLocaleUpperCase() : 'C',
  };
}
