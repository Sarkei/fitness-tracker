/** App-Daten-Migration (ExerciseDB + Open Food Facts). */

export const DATA_MIGRATION_VERSION = 2;

export function needsDataMigration(profile: {
  dataMigrationVersion?: number;
  migrationRequired?: boolean;
  /** @deprecated Legacy-Feld aus profile_extras */
  migrationV2Required?: boolean;
} | null | undefined): boolean {
  if (!profile) return false;
  if (profile.migrationRequired === true || profile.migrationV2Required === true) return true;
  const v = profile.dataMigrationVersion;
  return v == null || v < DATA_MIGRATION_VERSION;
}
