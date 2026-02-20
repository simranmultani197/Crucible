use std::path::{Path, PathBuf};
use tokio::fs;
use anyhow::{anyhow, Result};

pub struct SnapshotStore {
    base_dir: PathBuf,
}

impl SnapshotStore {
    pub async fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        let base_dir = base_path.as_ref().to_path_buf();
        fs::create_dir_all(&base_dir).await?;
        
        let tmp_dir = base_dir.join(".tmp");
        fs::create_dir_all(&tmp_dir).await?;

        Ok(Self { base_dir })
    }

    /// Prepare a temporary directory for snapshot creation (Phase 1)
    pub async fn begin_snapshot(&self, snapshot_id: &str) -> Result<PathBuf> {
        let tmp_path = self.base_dir.join(".tmp").join(snapshot_id);
        if tmp_path.exists() {
            fs::remove_dir_all(&tmp_path).await?;
        }
        fs::create_dir_all(&tmp_path).await?;
        Ok(tmp_path)
    }

    /// Write the COMPLETE marker and rename the directory into its final location (Phase 2)
    pub async fn commit_snapshot(&self, snapshot_id: &str) -> Result<PathBuf> {
        let tmp_path = self.base_dir.join(".tmp").join(snapshot_id);
        if !tmp_path.exists() {
            return Err(anyhow!("Cannot commit missing snapshot tmp dir: {}", tmp_path.display()));
        }

        let marker_path = tmp_path.join("COMPLETE");
        fs::write(&marker_path, b"").await?;

        // Fsync the directory (optional but recommended for crash consistency)
        let _ = fs::File::open(&tmp_path).await?.sync_all().await;

        let final_path = self.base_dir.join(snapshot_id);
        if final_path.exists() {
            fs::remove_dir_all(&final_path).await?;
        }

        fs::rename(&tmp_path, &final_path).await?;
        Ok(final_path)
    }

    /// Abort a snapshot and clean up the temp directory
    pub async fn abort_snapshot(&self, snapshot_id: &str) -> Result<()> {
        let tmp_path = self.base_dir.join(".tmp").join(snapshot_id);
        if tmp_path.exists() {
            fs::remove_dir_all(&tmp_path).await?;
        }
        Ok(())
    }

    /// Delete a finalized snapshot
    pub async fn delete_snapshot(&self, snapshot_id: &str) -> Result<()> {
        let path = self.base_dir.join(snapshot_id);
        if path.exists() {
            fs::remove_dir_all(&path).await?;
        }
        Ok(())
    }

    /// Validate that a snapshot exists and has the COMPLETE marker
    pub async fn is_snapshot_ready(&self, snapshot_id: &str) -> bool {
        let path = self.base_dir.join(snapshot_id);
        path.join("COMPLETE").exists()
    }

    /// Get the final path to a ready snapshot
    pub fn get_snapshot_dir(&self, snapshot_id: &str) -> Option<PathBuf> {
        let path = self.base_dir.join(snapshot_id);
        if path.join("COMPLETE").exists() {
            Some(path)
        } else {
            None
        }
    }
}
