-- 022_add_memory_fts5.sql
-- Full-Text Search (FTS5) virtual table for memory fast searching.
-- Provides efficient semantic and exact-match searching on memory content and keys.

-- Create FTS5 virtual table for full-text search on memories
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,
  key,
  content='memories',
  content_rowid='id'
);

-- Sync trigger for INSERT — keep FTS5 in sync when new memories are added
CREATE TRIGGER IF NOT EXISTS memory_fts_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memory_fts(rowid, content, key) VALUES (new.id, new.content, new.key);
END;

-- Sync trigger for DELETE — keep FTS5 in sync when memories are removed
CREATE TRIGGER IF NOT EXISTS memory_fts_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, key) VALUES('delete', old.id, old.content, old.key);
END;

-- Sync trigger for UPDATE — keep FTS5 in sync when memories are modified
CREATE TRIGGER IF NOT EXISTS memory_fts_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, key) VALUES('delete', old.id, old.content, old.key);
  INSERT INTO memory_fts(rowid, content, key) VALUES (new.id, new.content, new.key);
END;

-- Populate FTS5 table with existing memory data
INSERT INTO memory_fts(rowid, content, key) SELECT id, content, key FROM memories;
