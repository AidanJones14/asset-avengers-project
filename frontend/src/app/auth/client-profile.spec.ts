import { clientProfile } from './client-profile';
import { AccessClaims } from './auth.service';

describe('Client profile display', () => {
  it('uses signed-in names for the welcome and initials', () => {
    const profile = clientProfile({ name: 'Anika Ahmed', given_name: 'Anika', family_name: 'Ahmed', email: 'anika@example.com' } as AccessClaims);
    expect(profile).toEqual({ name: 'Anika Ahmed', firstName: 'Anika', email: 'anika@example.com', initials: 'AA' });
  });
  it('supports separate name claims and full names without a given-name claim', () => {
    expect(clientProfile({ given_name: 'Jo', family_name: 'Lee' } as AccessClaims).name).toBe('Jo Lee');
    expect(clientProfile({ name: 'Sam Jones' } as AccessClaims).firstName).toBe('Sam');
  });
  it('keeps email as contact information rather than inventing a name', () => {
    expect(clientProfile(null, 'client@example.com')).toEqual({ name: 'client@example.com', firstName: '', email: 'client@example.com', initials: 'C' });
  });
});
