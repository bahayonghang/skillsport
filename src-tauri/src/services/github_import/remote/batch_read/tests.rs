use super::*;
use crate::targets::{CommandRunner, ProcessRequest, RunnerError};
use crate::test_support::FakeRunner;

fn connection(runner: Arc<dyn CommandRunner>, wsl: bool) -> ConnectedRemoteTarget {
    if wsl {
        return ConnectedRemoteTarget::Wsl(
            crate::targets::ConnectedWslTarget::for_tests_with_runner(
                crate::targets::WslTargetConfig {
                    id: "batch-wsl".into(),
                    label: "test".into(),
                    distribution: "test".into(),
                    remote_home: "/home/test".into(),
                    remote_os: "Linux".into(),
                    symlink_enabled: true,
                },
                runner,
            ),
        );
    }
    ConnectedRemoteTarget::Ssh(crate::targets::ConnectedSshTarget::for_tests_with_runner(
        crate::targets::RemoteTargetConfig {
            id: "batch-ssh".into(),
            label: "test".into(),
            host: "example.invalid".into(),
            username: "test".into(),
            port: 22,
            auth_method: crate::targets::SshAuthMethod::Key,
            key_path: String::new(),
            credential_key: None,
            protected_password: None,
            password: None,
            remote_home: "/home/test".into(),
            remote_os: "Linux".into(),
            symlink_enabled: true,
        },
        runner,
    ))
}

fn entry(path: &str, bytes: &[u8]) -> PreviewSnapshotFile {
    PreviewSnapshotFile {
        repo_path: path.into(),
        byte_len: bytes.len() as u64,
        sha256: file_sha256(bytes),
    }
}

#[tokio::test]
async fn binary_unicode_and_empty_files_share_one_supervised_batch_on_ssh_and_wsl() {
    let entries = [
        entry("SKILL.md", b"skill"),
        entry("assets/图 ' $.bin", &[0, 255, 10]),
        entry("empty", b""),
    ];
    let selected = entries.iter().collect::<Vec<_>>();
    for wsl in [false, true] {
        let runner = Arc::new(FakeRunner::new());
        runner.push_output_bytes(0, &[b's', b'k', b'i', b'l', b'l', 0, 255, 10], b"");
        let snapshot =
            read_verified_files(&connection(runner.clone(), wsl), "/tmp/repo", &selected)
                .await
                .unwrap();
        assert_eq!(snapshot.files.len(), 3);
        assert_eq!(snapshot.files["assets/图 ' $.bin"], [0, 255, 10]);
        assert!(snapshot.files["empty"].is_empty());
        let calls = runner.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].policy,
            crate::targets::ProcessPolicy::bulk_transfer()
        );
        assert_eq!(
            calls[0].stdin.as_deref(),
            Some(read_batch_script("/tmp/repo", &selected).as_bytes())
        );
        assert!(calls[0].args.last().unwrap().contains("sh -s --"));
    }
}

#[tokio::test]
async fn batch_rejects_same_length_tampering_truncation_and_extra_bytes() {
    let expected = entry("SKILL.md", b"good");
    for output in [b"evil".as_slice(), b"goo", b"good!"] {
        let runner = Arc::new(FakeRunner::new());
        runner.push_output_bytes(0, output, b"");
        assert!(matches!(
            read_verified_files(&connection(runner, false), "/tmp/repo", &[&expected]).await,
            Err(GithubImportError::PreviewSnapshotIntegrity)
        ));
    }
}

#[tokio::test]
async fn invalid_manifest_is_rejected_before_any_process() {
    let runner = Arc::new(FakeRunner::new());
    let conn = connection(runner.clone(), false);
    let safe = entry("SKILL.md", b"x");
    let unsafe_path = entry("../outside", b"x");
    let mut oversized = safe.clone();
    oversized.byte_len = ResourceBudget::default_skill().archive_entry_bytes + 1;
    for selected in [vec![&safe, &safe], vec![&unsafe_path], vec![&oversized]] {
        assert!(read_verified_files(&conn, "/tmp/repo", &selected)
            .await
            .is_err());
    }
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn empty_selection_does_not_read_and_remote_failure_does_not_return_partial_snapshot() {
    let runner = Arc::new(FakeRunner::new());
    let conn = connection(runner.clone(), false);
    assert!(read_verified_files(&conn, "/tmp/repo", &[])
        .await
        .unwrap()
        .files
        .is_empty());
    assert!(runner.calls().is_empty());
    runner.push_output_bytes(44, b"partial", b"");
    assert!(
        read_verified_files(&conn, "/tmp/repo", &[&entry("SKILL.md", b"good")])
            .await
            .is_err()
    );
}

#[test]
fn batches_respect_file_and_byte_caps_including_maximum_entry() {
    let files = (0..65)
        .map(|n| entry(&format!("{n}.bin"), b"x"))
        .collect::<Vec<_>>();
    assert_eq!(batch_len(&files.iter().collect::<Vec<_>>()), 64);
    let mut big = entry("large", b"");
    big.byte_len = BATCH_BYTES;
    validate_selected_files(&[&big]).unwrap();
    assert_eq!(batch_len(&[&big, &files[0]]), 1);
    assert_eq!(
        BATCH_BYTES as usize,
        crate::targets::ProcessPolicy::bulk_transfer().stdout_limit
    );
    let mut half = big.clone();
    half.byte_len /= 2;
    assert_eq!(batch_len(&[&half, &half, &files[0]]), 2);
}

struct DelayedRunner {
    inner: FakeRunner,
}

#[async_trait::async_trait]
impl CommandRunner for DelayedRunner {
    async fn run(&self, request: ProcessRequest<'_>) -> Result<std::process::Output, RunnerError> {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        self.inner.run(request).await
    }
}

#[tokio::test]
async fn simulated_latency_baseline_and_batch_transfer_identical_bytes() {
    // The baseline reproduces the removed production loop using the same
    // transport seam. No speed threshold: wall time is evidence, not a flaky gate.
    let files = (0..128)
        .map(|n| entry(&format!("file-{n}.bin"), &[0, 255, 1, 2]))
        .collect::<Vec<_>>();
    let selected = files.iter().collect::<Vec<_>>();
    let old = Arc::new(DelayedRunner {
        inner: FakeRunner::new(),
    });
    for _ in &files {
        old.inner.push_output_bytes(0, &[0, 255, 1, 2], b"");
    }
    let old_connection = connection(old.clone(), false);
    let start = std::time::Instant::now();
    let mut legacy = HashMap::new();
    for file in &files {
        let bytes = old_connection
            .read_file_bounded(&remote_join("/tmp/repo", &file.repo_path), file.byte_len)
            .await
            .unwrap();
        assert_eq!(bytes.len() as u64, file.byte_len);
        legacy.insert(file.repo_path.clone(), bytes);
    }
    let old_elapsed = start.elapsed();
    let new = Arc::new(DelayedRunner {
        inner: FakeRunner::new(),
    });
    for _ in 0..2 {
        new.inner
            .push_output_bytes(0, &[0, 255, 1, 2].repeat(64), b"");
    }
    let start = std::time::Instant::now();
    let snapshot = read_verified_files(&connection(new.clone(), false), "/tmp/repo", &selected)
        .await
        .unwrap();
    let new_elapsed = start.elapsed();
    assert_eq!(snapshot.files, legacy);
    assert_eq!(old.inner.calls().len(), 128);
    assert_eq!(new.inner.calls().len(), 2);
    println!("SIMULATED 10ms/call; files=128; content_bytes=512; legacy_calls=128 legacy_ms={:.2}; batch_calls=2 batch_ms={:.2}",
        old_elapsed.as_secs_f64() * 1000.0, new_elapsed.as_secs_f64() * 1000.0);
}

#[tokio::test]
#[ignore = "requires SKILLPORT_TEST_POSIX_SHELL pointing to a local POSIX shell"]
async fn batch_script_executes_binary_paths_and_rejects_missing_or_resized_files() {
    let shell = std::env::var_os("SKILLPORT_TEST_POSIX_SHELL").expect("POSIX shell path");
    let root = tempfile::tempdir().unwrap();
    let entries = [
        entry("SKILL.md", b"skill"),
        entry("图 ' $.bin", &[0, 255, 10]),
        entry("empty", b""),
    ];
    for (entry, bytes) in entries
        .iter()
        .zip([b"skill".as_slice(), &[0, 255, 10], b""])
    {
        std::fs::write(root.path().join(&entry.repo_path), bytes).unwrap();
    }
    let refs = entries.iter().collect::<Vec<_>>();
    let script = read_batch_script(".", &refs);
    for iteration in 0..3 {
        if iteration == 1 {
            std::fs::write(root.path().join("SKILL.md"), b"resized").unwrap();
        }
        if iteration == 2 {
            std::fs::remove_file(root.path().join("SKILL.md")).unwrap();
        }
        let mut command = std::process::Command::new(&shell);
        command.arg("-s").arg("--").current_dir(root.path());
        let output = crate::targets::ProcessRunner
            .run(
                ProcessRequest::new(command, crate::targets::ProcessPolicy::bulk_transfer())
                    .with_stdin(script.as_bytes()),
            )
            .await
            .unwrap();
        if iteration == 0 {
            assert!(output.status.success());
            let mut decoded = HashMap::new();
            decode_batch(&refs, &output.stdout, &mut decoded).unwrap();
            assert_eq!(decoded["图 ' $.bin"], [0, 255, 10]);
        } else {
            assert!(!output.status.success());
        }
    }
}
