# 实施步骤与质量门

本轮只规划；先完成视觉子任务，再由用户后续确认启动本任务。任何新增扫描 benchmark 都只使用 TempDir/可注入 roots/fake transport，不能误跑真实 HOME harness。

1. [x] 加载 backend/frontend usage、target-context、spawn-blocking、redaction、migrations、transactional mutations 与 quality spec；复核父任务研究和视觉交接。
2. [x] 新增离线 baseline harness、>50 全量榜单、重复 occurrence、Claude/Grok winner、cold/warm/append/delete/failure fixture。先小规模验证，stress 最大约 200MiB/5000文件，先告知并记录生成成本。
3. [x] 给 scan race 和读 snapshot 构造 barrier 复现，再实现 usage 同 target single-flight、coherent page read、排名全集与后台 freshness。一轮完成 typed IPC/store/spec/doc 变更并定向验证，保留所有序列保护。
4. [x] 优化热力图阈值、unique skill 去重和 identity 多值索引；对照原实现验证全零/小样本/边界/重复/歧义，记录复杂度斜率，不改变视觉几何。
5. [x] 设计最小 provenance migration 和旧库首次 rebuild，先验证原 provider 去重/失败语义；将 cache diff 推迟到 facts 共同事务发布。先过注入失败/恢复测试，再允许按 fingerprint 跳过工作。
6. [x] 分别落地无变更0 fact writes、changed/vanished受影响组更新，metadata 保持可失效；检查 PA5/PA6，Remote和unsupported delta保留安全路径。
7. [x] 重跑阶段 profile。只有被证实的热点才继续 SQL/index/metadata/day aggregate/cache 或有界 DOM；每个候选比较结果、读/写成本和内存。不默认做 append-byte seek/remote watermark。
8. [ ] 取得基线与优化后 release 对照，5预热+20样本、p50/p95/counters/WorkingSet，冻结完整数据 oracle；检查 PA7/PA8，并保存最小可复现输入。

已有安全定向入口：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked refresh_incremental_rescan_reuses_file_cache_and_stays_equivalent -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --locked remote_fatal_error_preserves_every_target_cache_table
cargo test --manifest-path src-tauri/Cargo.toml --locked metadata_replacement_is_atomic_and_target_scoped
pnpm exec vitest run src/test/stores/usageStore.test.ts src/test/components/usage/SkillUsage.components.test.tsx src/test/components/usage/UnusedSkillsPanel.test.tsx
```

新增的基准必须使用唯一 synthetic 测试名，并核对实际执行数>0；以下入口当前不存在，实施时新增后再运行：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --release --locked usage_bench_synthetic_pipeline -- --ignored --nocapture --test-threads=1
```

9. [x] 根据变更同步生成物，然后检查：

```powershell
# 命令签名/协议变化时
pnpm ipc:codegen
# 命令或schema变化时
pnpm docs:gen
pnpm ipc:codegen:check
pnpm docs:gen:check
pnpm typecheck
pnpm lint
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
just ci
```

10. [ ] Windows WebView2 验证缓存首屏、显式扫描、平台/target切换、后台完成、详情焦点和最大化/还原，记录 click→paint/long tasks。浏览器 benchmark 不作为原生或安装包证据。
11. [x] 检查代理审查跨层契约、发布原子性、migration与旧库回读；主会话回填 PA1-PA9、风险/跳过项并交父任务集成。包装相关变更才补 Windows bundle 门，不因纯性能工作默认发布或安装。

## 阶段回退点

入口/快照、小算法、provenance共同发布、delta写入、读/DOM候选分别成独立可验收单元。delta correctness 未过不得启用跳过；失败保留 full-rebuild fallback；不回写或删真实源日志。遇到既有 CI 基线故障，独立记录，不把与 usage 无关的修复并入本任务。

## 收尾结果

用户已批准实施并人工验收当前结果，原“本轮只规划”描述为历史计划。产品代码与生成物质量门通过；原生自动验证限冷首屏/最大化，其余以单元/浏览器和用户人工验收为证据。剩余数值及完整 native trace 指标按接受的限制关闭，未虚构通过。
