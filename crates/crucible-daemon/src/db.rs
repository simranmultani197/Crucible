use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::sync::Arc;
use anyhow::Result;

#[derive(Clone)]
pub struct Db {
    pub pool: SqlitePool,
}

impl Db {
    pub async fn new(db_url: &str) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(db_url)
            .await?;
        
        // Initialize schema
        Self::init_schema(&pool).await?;

        Ok(Self { pool })
    }

    async fn init_schema(pool: &SqlitePool) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS snapshots (
                snapshot_id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                source_sandbox_id TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                mode TEXT NOT NULL,
                name TEXT,
                labels TEXT, -- JSON
                parent_snapshot_id TEXT,
                root_snapshot_id TEXT NOT NULL,
                state TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                components TEXT, -- JSON
                pinned BOOLEAN NOT NULL DEFAULT 0,
                ttl_expires_at DATETIME,
                last_error TEXT,
                FOREIGN KEY (parent_snapshot_id) REFERENCES snapshots (snapshot_id)
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_sandbox ON snapshots (source_sandbox_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_parent ON snapshots (parent_snapshot_id);

            CREATE TABLE IF NOT EXISTS snapshot_refs (
                snapshot_id TEXT NOT NULL,
                ref_type TEXT NOT NULL,
                ref_id TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (snapshot_id, ref_type, ref_id),
                FOREIGN KEY (snapshot_id) REFERENCES snapshots (snapshot_id) ON DELETE CASCADE
            );
            "#
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn insert_snapshot(
        &self,
        snapshot_id: &str,
        provider: &str,
        source_sandbox_id: &str,
        mode: &str,
        root_snapshot_id: &str,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO snapshots (snapshot_id, provider, source_sandbox_id, mode, root_snapshot_id, state) VALUES (?, ?, ?, ?, ?, 'CREATING')"
        )
        .bind(snapshot_id)
        .bind(provider)
        .bind(source_sandbox_id)
        .bind(mode)
        .bind(root_snapshot_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    pub async fn set_snapshot_ready(&self, snapshot_id: &str, size_bytes: u64) -> Result<()> {
        sqlx::query(
            "UPDATE snapshots SET state = 'READY', size_bytes = ? WHERE snapshot_id = ?"
        )
        .bind(size_bytes as i64)
        .bind(snapshot_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_snapshot_state(&self, snapshot_id: &str) -> Result<String> {
        let rec: (String,) = sqlx::query_as(
            "SELECT state FROM snapshots WHERE snapshot_id = ?"
        )
        .bind(snapshot_id)
        .fetch_one(&self.pool)
        .await?;
        
        Ok(rec.0)
    }

    pub async fn get_gc_candidates(&self, keep_latest_per_sandbox: u32) -> Result<Vec<(String, u64)>> {
        let rows = sqlx::query_as::<_, (String, i64)>(
            r#"
            WITH RECURSIVE
              protected_snapshots AS (
                SELECT snapshot_id, source_sandbox_id, parent_snapshot_id
                FROM snapshots
                WHERE pinned = 1
                   OR snapshot_id IN (SELECT snapshot_id FROM snapshot_refs)
                   OR snapshot_id IN (
                       SELECT snapshot_id FROM (
                           SELECT snapshot_id, ROW_NUMBER() OVER (PARTITION BY source_sandbox_id ORDER BY created_at DESC) as rn
                           FROM snapshots
                           WHERE state = 'READY'
                       ) WHERE rn <= ?
                   )
              ),
              ancestors(snapshot_id, parent_snapshot_id) AS (
                SELECT snapshot_id, parent_snapshot_id FROM protected_snapshots
                UNION ALL
                SELECT s.snapshot_id, s.parent_snapshot_id
                FROM snapshots s
                JOIN ancestors a ON a.parent_snapshot_id = s.snapshot_id
              )
            SELECT snapshot_id, size_bytes
            FROM snapshots
            WHERE state = 'READY'
              AND snapshot_id NOT IN (SELECT snapshot_id FROM ancestors)
            "#
        )
        .bind(keep_latest_per_sandbox)
        .fetch_all(&self.pool)
        .await?;
        
        Ok(rows.into_iter().map(|(id, size)| (id, size as u64)).collect())
    }

    pub async fn mark_snapshot_deleted(&self, snapshot_id: &str) -> Result<()> {
        sqlx::query("UPDATE snapshots SET state = 'DELETED' WHERE snapshot_id = ?")
            .bind(snapshot_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

