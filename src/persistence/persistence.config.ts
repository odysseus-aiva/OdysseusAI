export type PersistenceProvider = 'memory' | 'mongodb';

export function resolvePersistenceProvider(): PersistenceProvider {
  const value = (process.env.PERSISTENCE_PROVIDER ?? 'memory').toLowerCase();
  return value === 'mongodb' ? 'mongodb' : 'memory';
}

export function isMongoPersistence(): boolean {
  return resolvePersistenceProvider() === 'mongodb';
}
