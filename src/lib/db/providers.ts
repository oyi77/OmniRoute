export async function setDefaultProvider(id: string) {
  const db = getDbInstance() as unknown as DbLike;
  const result = db.prepare("UPDATE provider_connections SET is_default = 0").run();
  const result2 = db.prepare("UPDATE provider_connections SET is_default = 1 WHERE id = ?").run(id);
  invalidateDbCache();
  return result2.changes === 1;
}
