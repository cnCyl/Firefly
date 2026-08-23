---
title: k8s面试题
published: 2026-08-23
updated: 2026-08-23
description: k8s面试题
tags: [面试,k8s]
category: 面试
slug: interview_k8s-20260823-01
author: ylxs
---

# 一、 基础概念与集群架构

1. **Kubernetes 控制面的核心组件有哪些？各自的作用是什么？**

参考答案：

- **kube-apiserver**：集群的入口与唯一网关，所有组件和 kubectl 的请求都经它处理，负责认证、鉴权、准入控制。
- **etcd**：集群的"数据库"，保存所有对象的状态（声明式期望状态）。
- **kube-controller-manager**：运行各类控制器（Deployment、Node、Namespace 等），不断把实际状态收敛到期望状态。
- **kube-scheduler**：为新 Pod 选择最合适的节点。
- **cloud-controller-manager**：对接云厂商 API（负载均衡、路由、存储卷），可选组件。

2. **kubelet 的作用是什么？它与容器运行时如何交互？**

参考答案：

- **kubelet** 是每个节点上的"代理"，负责：接收 apiserver 下发的 Pod 期望状态 → 通过 **CRI（容器运行时接口）** 调用容器运行时（containerd/docker）创建/启停容器 → 上报节点与 Pod 状态 → 执行探针（liveness/readiness）。
- 交互链路：`apiserver → kubelet → CRI → containerd → runc`。

3. **etcd 在集群中扮演什么角色？为什么需要它？**

参考答案：

- etcd 是集群的**唯一数据源**，存储所有 API 对象（Pod、Service、ConfigMap 等）和集群元数据，是分布式一致性键值存储（基于 Raft）。
- 重要性：apiserver 的所有读写都经过 etcd；etcd 挂了，集群"只读不可改"，节点不可调度新 Pod。
- 运维要点：定期备份（`etcdctl snapshot save`）、控制面节点上独立部署、磁盘 IO 要求高。

# 二、 Pod 与容器编排

4. **为什么 Kubernetes 的最小调度单位是 Pod 而不是容器？**

参考答案：

- Pod 是**共享网络命名空间和存储卷**的容器集合，是调度的最小单元。
- 同一个 Pod 内的容器共享 IP、端口空间、hostname，可通过 localhost 互访；适合"主容器 + 伴生容器（sidecar）"场景（如日志采集、代理注入）。
- 调度、网络、存储都以 Pod 为边界，容器只是 Pod 内的进程。

5. **Pod 的常见状态有哪些？分别代表什么？**

参考答案：

- **Pending**：已创建但未调度成功（资源不足、污点、调度器异常）。
- **Running**：至少一个容器正在运行。
- **Succeeded / Failed**：Pod 正常/异常退出（Job 场景常见）。
- **Unknown**：节点失联，apiserver 无法获取状态。
- **CrashLoopBackOff**：容器启动后崩溃，kubelet 按指数退避重启。
- **ImagePullBackOff**：镜像拉取失败。

6. **Pod 一直处于 Pending 或 CrashLoopBackOff，排查思路是什么？**

参考答案：

- Pending：`kubectl describe pod` 看 Events → 检查节点资源（`kubectl top node`）、污点容忍、PVC 绑定、调度器日志。
- CrashLoopBackOff：`kubectl logs` 看容器输出 → `kubectl describe pod` 看 Last State 的退出码与原因 → 检查探针配置、启动命令、资源限制是否过低（OOMKilled）。

# 三、 控制器

7. **Deployment、StatefulSet、DaemonSet 的区别与适用场景？**

参考答案：

- **Deployment**：无状态应用，管理 ReplicaSet，支持滚动更新/回滚，Pod 可被随意替换（无身份）。
- **StatefulSet**：有状态应用（数据库、中间件），Pod 有稳定网络标识和稳定存储（PVC 按序绑定），支持有序部署/缩容。
- **DaemonSet**：每个节点运行一个副本（日志采集、监控 Agent、网络插件），新节点加入自动部署。

8. **Deployment 的滚动更新策略如何配置？如何回滚？**

参考答案：

- 策略：`strategy.type: RollingUpdate`，参数 `maxUnavailable`（最大不可用数）与 `maxSurge`（最大额外数）。
- 更新：修改镜像后 `kubectl set image` 或 apply 新 YAML，控制器逐步替换 Pod。
- 回滚：`kubectl rollout undo deployment/xxx`（回滚到上一版本），`--to-revision=N` 指定版本；`kubectl rollout status` 查看进度。
- 金丝雀发布：可创建第二个 Deployment 或利用 `maxSurge` 逐步放量，再配合 Service 权重/Ingress 灰度。

9. **Job 和 CronJob 的适用场景？**

参考答案：

- **Job**：一次性任务（数据迁移、批量计算），保证任务完成指定次数，失败自动重试（backoffLimit）。
- **CronJob**：定时任务（定时备份、报表），基于 Cron 表达式调度，管理多个 Job。
- 运维常配合：任务完成后清理（TTL 机制）、并发策略（Allow/Forbid/Replace）。

# 四、 服务发现与网络

10. **Service 的类型有哪些？各自适用什么场景？**

参考答案：

- **ClusterIP**：集群内部虚拟 IP，默认类型，仅供集群内访问。
- **NodePort**：在每个节点开放固定端口（30000-32767），集群外通过 `节点IP:NodePort` 访问。
- **LoadBalancer**：对接云厂商 LB，自动创建外部负载均衡（需 cloud-provider）。
- **Headless**（clusterIP: None）：无虚拟 IP，直接返回后端 Pod IP 列表，供 StatefulSet 稳定域名、自定义负载均衡场景使用。

11. **Ingress 的作用是什么？与 Service 的关系？**

参考答案：

- **Ingress** 是集群的**七层（HTTP/HTTPS）入口**，负责根据域名/路径把外部请求路由到集群内 Service。
- 关系：Ingress → Ingress Controller（如 Nginx、Traefik）→ Service → Endpoints → Pod。
- 能力：域名与路径路由、TLS 证书、重写、限流、灰度（canary）。
- 与 NodePort/LoadBalancer 的区别：Ingress 是七层智能路由，Service 是四层负载均衡。

12. **Pod 内 DNS 解析失败，如何排查？**

参考答案：

- 检查 CoreDNS Pod 是否正常：`kubectl get pods -n kube-system | grep coredns`。
- 检查 Pod 的 DNS 配置：`/etc/resolv.conf` 是否指向 kube-dns（ClusterDNS）。
- 验证 Service 名解析：`nslookup <service>.<namespace>.svc.cluster.local`。
- 常见原因：CoreDNS 副本不足/CPU 限制、kubelet 的 `--cluster-dns` 配置错误、网络插件（CNI）与 DNS 策略冲突、Pod 使用 hostNetwork。

# 五、 存储

13. **PV、PVC、StorageClass 三者的关系？**

参考答案：

- **PV**：集群级存储资源（管理员预先创建或动态供给）。
- **PVC**：用户的存储"申请"，声明需要的容量与访问模式（ReadWriteOnce/ReadOnlyMany/ReadWriteMany）。
- **StorageClass**：动态供给模板，PVC 指定 storageClassName 后自动创建 PV（如云盘、NFS）。
- 关系：`PVC 绑定 PV → Pod 引用 PVC`；无 StorageClass 时需手动创建 PV 静态供给。

14. **emptyDir、hostPath、云盘等卷类型的区别？**

参考答案：

- **emptyDir**：Pod 生命周期内的临时目录，Pod 删除数据即消失；适合缓存、sidecar 共享数据。
- **hostPath**：挂载宿主机目录，数据持久但绑定节点（节点故障数据不迁移），适合 DaemonSet（如日志目录）。
- **云盘/CSI**（如 AWS EBS、阿里云云盘）：真正的持久化存储，支持动态供给、快照、跨节点迁移，适合数据库。
- **NFS**：网络共享存储，支持多节点读写（ReadWriteMany），适合共享文件场景。

15. **StatefulSet 如何保证数据持久化？**

参考答案：

- 每个副本绑定**独立的 PVC**（通过 `volumeClaimTemplates` 自动创建），Pod 重建后重新挂载同名 PVC，数据不丢失。
- Pod 有稳定标识（`statefulset-0`、`statefulset-1`），删除后重建仍挂载原 PVC。
- 注意：删除 StatefulSet 默认不删除 PVC（数据保留），需手动清理；缩容时 PVC 保留，扩容时复用。

# 六、 配置管理

16. **ConfigMap 和 Secret 的区别？Secret 的加密机制？**

参考答案：

- **ConfigMap**：存储非敏感配置（配置文件、环境变量）。
- **Secret**：存储敏感数据（密码、Token、证书），值要求 base64 编码。
- Secret 的"加密"：默认只做 base64 编码（**非真正加密**）；生产建议开启 **KMS 加密**（etcd 中加密存储）或使用外部密钥管理（Vault、Sealed Secrets）。

17. **ConfigMap 更新后，Pod 中的配置为什么没有生效？如何解决？**

参考答案：

- 原因：**环境变量注入是创建时一次性写入的**，ConfigMap 更新不会自动更新环境变量。
- 解决：挂载为**卷**（volume mount）时，kubelet 会定期同步（约 1 分钟）配置文件；环境变量方式需滚动重启 Pod（`kubectl rollout restart`）。
- 生产实践：用 `reloader` 等工具监听 ConfigMap 变化自动触发滚动更新。

18. **给 Pod 注入配置有哪些方式？**

参考答案：

- **环境变量**：`env.valueFrom.configMapKeyRef/secretKeyRef`。
- **卷挂载**：把 ConfigMap/Secret 挂载为文件（文件级更新生效）。
- **命令行参数**：通过 args 引用环境变量。
- 注意事项：Secret 以 volume 挂载时建议设置 `defaultMode` 权限、开启 `optional` 容忍缺失。

# 七、 调度

19. **Pod 的调度流程是怎样的？nodeSelector、nodeAffinity、污点容忍有什么区别？**

参考答案：

- 调度流程：`Pod 创建 → 调度器 Filtering（过滤节点）→ Scoring（打分）→ 绑定节点`。
- **nodeSelector**：最简单的节点标签匹配（精确等于）。
- **nodeAffinity**：更灵活的节点亲和（支持 In/NotIn/Exists、软硬约束 requiredDuringScheduling/preferredDuringScheduling）。
- **污点（Taint）与容忍（Toleration）**：节点打污点排斥 Pod，Pod 加容忍才能调度上去；用于隔离专用节点、驱逐维护。
- 组合使用：节点打标签 + nodeAffinity 定向调度 + 污点防止普通 Pod 误调度。

20. **Pod 的资源请求（requests）与限制（limits）？QoS 等级有哪些？**

参考答案：

- **requests**：调度保证值，节点按 requests 累计判断能否容纳。
- **limits**：运行上限，超过可能被 OOM Kill（内存）或限流（CPU）。
- **QoS 三等级**：
  - **Guaranteed**：requests == limits（最高优先，最不易被杀）。
  - **Burstable**：requests < limits（部分保证）。
  - **BestEffort**：不设置 requests/limits（最先被杀）。
- 运维建议：核心业务设置 Guaranteed，避免内存突发导致节点 OOM。

21. **如何把 Pod 固定调度到指定节点？**

参考答案：

- `nodeSelector`：节点打标签（如 `disktype=ssd`）+ Pod 指定。
- `nodeAffinity`：required 硬约束。
- `nodeName`：直接指定节点名（绕过调度器，仅调试用）。
- 配合污点：目标节点打污点 + Pod 加对应容忍，防止其他 Pod 调度上去。
- 注意：固定调度会影响故障转移，高可用业务慎用。

# 八、 安全

22. **RBAC 的核心对象有哪些？如何实现最小权限？**

参考答案：

- 核心对象：**Role/ClusterRole**（权限定义）、**RoleBinding/ClusterRoleBinding**（权限绑定）、**ServiceAccount**（Pod 身份）。
- 最小权限实践：按角色创建 ServiceAccount → 绑定最小操作权限（只授予需要的资源与方法）→ Pod 指定 `serviceAccountName` → 定期审计（`kubectl auth can-i`）。
- 示例：只读权限用 `resources: pods, services` + `verbs: get, list, watch`。

23. **NetworkPolicy 的作用与实现原理？**

参考答案：

- **NetworkPolicy**：集群内**网络隔离**策略，控制 Pod 之间的流量（入站/出站），基于标签选择器。
- 原理：需要 CNI 支持（Calico、Cilium、Weave），在节点上通过 iptables/IPVS/eBPF 实现规则下发。
- 默认行为：未定义策略时 Pod 全互通；定义后按策略白名单放行。
- 典型场景：隔离命名空间、数据库只允许应用 Pod 访问、禁止跨环境互通。

24. **Pod 的安全上下文（SecurityContext）有哪些常用配置？**

参考答案：

- `runAsUser/runAsGroup`：指定运行用户（避免 root）。
- `readOnlyRootFilesystem`：只读根文件系统。
- `capabilities`：丢弃/添加 Linux 能力（如 `drop: [ALL]`）。
- `allowPrivilegeEscalation: false`：禁止提权。
- 配合 **PodSecurity 准入**（baseline/restricted）与容器镜像扫描，构建纵深防御。

# 九、 运维实践

25. **Kubernetes 集群的日志方案有哪些？容器日志如何采集？**

参考答案：

- 常见方案：**EFK/ELK**（Elasticsearch + Fluentd/Filebeat + Kibana）、**Loki**（轻量，配合 Grafana）、云厂商日志服务。
- 采集原理：容器日志写入 `/var/log/containers/*.log`（软链到 Docker/containerd 的 json 或 CRI 日志格式）→ DaemonSet 方式的 Agent（Filebeat/Fluent Bit）采集 → 汇聚。
- 多行日志、时间戳、按命名空间/应用打标签是常见运维配置点。

26. **基于 Prometheus 的监控方案如何搭建？需要关注哪些核心指标？**

参考答案：

- 组件：**Prometheus Server + kube-state-metrics + node-exporter + 云原生 exporter + Alertmanager + Grafana**。
- 核心指标：节点（CPU/内存/磁盘/网络）、Pod（CPU/内存使用率、重启次数）、容器、API Server 延迟与错误率、etcd 延迟、调度失败数。
- 关键告警：节点 NotReady、Pod 频繁重启、PVC 磁盘使用率超阈值、证书过期、集群资源不足。

27. **节点 NotReady、Pod 无法调度、服务不通，分别如何排查？**

参考答案：

- **节点 NotReady**：`kubectl describe node` 看 Conditions → 检查 kubelet 状态（`systemctl status kubelet`）、容器运行时、磁盘空间（/var/lib 满）、网络插件。
- **Pod 无法调度**：`kubectl describe pod` 看 Events → 资源不足（requests 超出）、污点未容忍、节点亲和不满足、PVC 无法绑定。
- **服务不通**：从内到外排查——Pod 本身健康？→ Service 的 Endpoints 是否有 Pod？→ `kubectl get endpoints` → DNS 解析？→ 网络策略/防火墙？→ Ingress/LB 配置？

# 十、 高可用与升级

28. **控制面（Master）高可用方案如何设计？etcd 集群注意什么？**

参考答案：

- **控制面 HA**：至少 3 个 Master（奇数）运行 apiserver/controller-manager/scheduler，前面加负载均衡（云 LB 或 keepalived + VIP）。
- **etcd 集群**：3/5 节点奇数（Raft 多数派），部署在独立磁盘（SSD），网络延迟低；`--initial-cluster` 与证书配置一致。
- 验证：`kubectl get --raw='/healthz'`、`etcdctl endpoint health`；定期备份 etcd 快照并演练恢复。

29. **集群升级的流程与注意事项？**

参考答案：

- 流程：先升级**控制面**再升级**节点**（小版本可跳过中间版本）；`kubeadm upgrade plan/apply` → 节点 `drain` → 升级 kubelet/kubeadm → `uncordon`。
- 注意事项：备份 etcd、确认镜像与二进制版本兼容、滚动升级节点（一次一个）、观察关键工作负载健康、升级前检查 API 兼容性（废弃 API 移除）。
- 生产建议：先在测试集群验证，升级窗口避开业务高峰。

30. **节点维护（cordon/uncordon/drain）的作用？Pod 如何优雅驱逐？**

参考答案：

- **cordon**：标记节点不可调度（新 Pod 不上去），已有 Pod 不受影响。
- **drain**：驱逐节点上所有 Pod（`kubectl drain node --ignore-daemonsets`），先调用 **PreStop Hook** 优雅停止 → 超时后强制删除。
- **uncordon**：恢复调度。
- 优雅驱逐关键：Pod 配置 `terminationGracePeriodSeconds`（宽限期）、`preStop` 执行反注册/刷盘；PDB（PodDisruptionBudget）保证业务最小可用副本数。
- 运维习惯：`cordon → drain → 维护 → uncordon`，先排空再动节点。
