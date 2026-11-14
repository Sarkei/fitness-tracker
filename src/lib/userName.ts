/** Vor- und Nachname aus vollem Anzeigenamen (Bestandsdaten). */
export function splitNameParts(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function validateNameParts(firstName: string, lastName: string): boolean {
  return firstName.trim().length >= 2 && lastName.trim().length >= 2;
}

type NameRow = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  name?: string | null;
};

export function resolveUserNameFields(row: NameRow): {
  firstName: string;
  lastName: string;
  displayName: string;
} {
  const storedFirst = (row.first_name ?? '').trim();
  const storedLast = (row.last_name ?? '').trim();
  if (storedFirst || storedLast) {
    const displayName = buildDisplayName(storedFirst, storedLast) || row.display_name?.trim() || row.name?.trim() || '';
    return {
      firstName: storedFirst,
      lastName: storedLast,
      displayName,
    };
  }
  const legacy = (row.display_name ?? row.name ?? '').trim();
  const { firstName, lastName } = splitNameParts(legacy);
  return {
    firstName,
    lastName,
    displayName: buildDisplayName(firstName, lastName) || legacy,
  };
}
