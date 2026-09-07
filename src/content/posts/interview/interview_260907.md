---
title: 20260907面试题
published: 2026-09-07
updated: 2026-09-07
description: 20260907面试提问
tags: [面试]
category: 面试
slug: interview_260907-20260907-01
author: ylxs
---

# 一、 Java 应用

1. **Java 包的配置文件类型和区别？**

参考答案：

Java 项目常见的配置文件主要有以下几类：

- **properties 文件**（`.properties`）：`key=value` 格式，简单易读，无层级结构，适合简单配置；由 `Properties` 类加载；
- **XML 文件**（`.xml`）：有层级与约束（DTD/XSD），支持复杂结构、注释和命名空间；常见于 Spring 早期版本、MyBatis（mybatis-config.xml）、log4j/logback 的 XML 配置；缺点是冗长；
- **YAML 文件**（`.yml` / `.yaml`）：缩进式层级结构，简洁直观，支持列表与嵌套；Spring Boot 的主流配置格式（application.yml），也用于 Kubernetes 声明式配置；
- **JSON 文件**：结构化数据，常用于配置文件或配置中心下发；
- **其他**：`conf`（通用配置，如 Nginx、Tomcat server.xml）、`toml`（Cargo 等）、`ini`。

**区别要点**：有无层级、可读性、注释支持、Spring/Spring Boot 生态的加载方式（`application.properties` 与 `application.yml` 二选一，yml 优先级更高）。

2. **如何查看 jar 包的配置文件或者关键信息？**

参考答案：

- **查看 jar 内文件列表**：

```bash
jar tf app.jar                      # 列出所有文件
unzip -l app.jar                    # 等价（jar 本质是 zip）
```

- **查看 jar 内的某个配置/文件**：

```bash
unzip -p app.jar BOOT-INF/classes/application.yml
jar xf app.jar BOOT-INF/classes/application.yml   # 解压单个文件
```

- **查看 manifest 主类/版本信息**：

```bash
unzip -p app.jar META-INF/MANIFEST.MF
```

- **Spring Boot 场景**：配置文件一般在 `BOOT-INF/classes/` 下（application.yml、application-prod.yml）；
- **查看进程实际加载的配置**（生产更常用）：通过 `/proc/<pid>` 或 JVM 参数、启动命令确认：

```bash
# 查看进程启动命令（含 -Dspring.profiles.active 等参数）
ps -ef | grep java
cat /proc/<pid>/cmdline | tr '\0' ' '
```

- **运行时查看已生效配置**：Spring Boot 可用 Actuator 接口 `http://localhost:8080/actuator/env` 查看（需开启权限，生产注意安全）。

# 二、 Nginx

3. **Nginx 常见故障和排查思路？**

参考答案：

**（1）502 Bad Gateway（网关错误）**
- 后端服务未启动/崩溃、端口不通；
- `proxy_pass`/`fastcgi_pass` 地址配置错误；
- 防火墙未放行 Nginx 到后端端口。

```bash
# 排查
curl -I http://后端:端口/
netstat -tlnp | grep 后端端口
tail -f /var/log/nginx/error.log
```

**（2）504 Gateway Timeout（超时）**
- 后端响应慢（数据库慢查询、业务阻塞）；
- 调大 `proxy_read_timeout` / `fastcgi_read_timeout`。

**（3）413 Request Entity Too Large**
- 上传请求体超过 `client_max_body_size`，调大即可。

**（4）403 Forbidden**
- Nginx 用户对目录无读权限；
- 索引文件缺失且未开 `autoindex`；
- `deny` 规则误拦截。

**（5）404 Not Found**
- `root`/`alias` 路径错误、文件确实不存在；
- `try_files`、`location` 匹配到错误块。

**（6）连接数打满 / 高负载**
- `worker_connections` 不足、文件描述符（ulimit）耗尽；
- 被刷流量/CC 攻击 → 限流 + WAF；
- 检查 `nginx -t` 语法、error.log、`/nginx_status` 状态页。

**通用排查流程**：`nginx -t` 验配置 → 看 error.log → `curl -I` 复现 → 看后端/网络/防火墙 → 看系统资源（top、ss）。

# 三、 Kubernetes

4. **K8s Pod 无法启动的排查思路？**

参考答案：

**第一步：查看 Pod 状态与事件**

```bash
kubectl get pods -n <ns>
kubectl describe pod <pod> -n <ns>    # 重点看 Events 最后几行
```

**第二步：按状态分类定位**

- **Pending（未调度）**：资源不足（`kubectl top node`）、节点污点未容忍、nodeSelector/亲和不满足、PVC 未绑定；
- **ImagePullBackOff / ErrImagePull**：镜像名错误、镜像不存在、私有仓库认证失败（imagePullSecrets）、网络拉不到镜像；
- **CrashLoopBackOff（启动崩溃）**：`kubectl logs` 看应用报错、启动命令/探针配置错误、内存限制过低被 OOMKilled（`kubectl describe` 看 Last State）；
- **ContainerCreating 卡住**：镜像拉取慢、存储卷挂载失败（PV/PVC 状态）、CNI 网络插件异常；
- **Running 但业务不通**：探针失败（readiness/liveness）、端口暴露错误。

**第三步：看日志**

```bash
kubectl logs <pod> -n <ns> --previous   # 崩溃前日志
kubectl logs <pod> -c <container>       # 多容器指定容器
```

5. **K8s Pod 资源如何配置？**

参考答案：

通过 `resources` 字段设置 **requests（请求值）** 和 **limits（上限值）**：

```yaml
resources:
  requests:        # 调度保证值：节点按 requests 累计判断能否容纳
    cpu: "500m"    # 0.5 核
    memory: "512Mi"
  limits:          # 运行上限：超过内存会被 OOMKill，超过 CPU 被限流
    cpu: "1"
    memory: "1Gi"
```

配置要点：

- **CPU**：单位是核，`100m` = 0.1 核，是**可压缩资源**（超限限流不杀进程）；
- **内存**：单位 Mi/Gi，是**不可压缩资源**（超限触发 OOMKill）；
- **QoS 等级**（由 requests/limits 决定）：
  - `requests == limits` → **Guaranteed**（最高优先，不易被杀）；
  - `requests < limits` → **Burstable**；
  - 都不设置 → **BestEffort**（最先被杀）；
- 实践建议：核心业务设置 Guaranteed；requests 按正常负载预估、limits 留 20%-50% 余量；用 HPA 结合 requests 做自动扩缩容；用 LimitRange 约束命名空间默认值。

6. **介绍 K8s 的亲和性和污点？**

参考答案：

**（1）nodeSelector**：最简单，精确匹配节点标签（`disktype=ssd`）。

**（2）节点亲和性 nodeAffinity**：
- `requiredDuringScheduling...`（硬约束，必须满足）；
- `preferredDuringScheduling...`（软约束，尽量满足）；
- 支持 `In / NotIn / Exists / DoesNotExist / Gt / Lt` 操作符，可指定多条件。

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: disktype
              operator: In
              values: ["ssd"]
```

**（3）Pod 亲和/反亲和 podAffinity / podAntiAffinity**：按已有 Pod 的标签决定调度位置（如把同应用的副本分散到不同节点——反亲和，实现高可用）。

**（4）污点与容忍（Taint & Toleration）**：
- **污点打在节点上**：`kubectl taint nodes node1 key=value:NoSchedule`，污点有三类效果：
  - `NoSchedule`：不调度新 Pod（已存在的保留）；
  - `PreferNoSchedule`：尽量不调度；
  - `NoExecute`：不调度且驱逐已有 Pod；
- **容忍打在 Pod 上**：`tolerations` 声明能容忍哪个污点，才能调度到对应节点；

```yaml
tolerations:
  - key: "key"
    operator: "Equal"
    value: "value"
    effect: "NoSchedule"
```

**用途对比**：
- 亲和性 = "Pod 主动想去哪些节点"（选节点）；
- 污点 = "节点主动排斥某些 Pod"（控流入）；
- 组合用法：专用 GPU 节点打污点 + GPU 应用加容忍，普通 Pod 不会被调度上去；节点维护用 `cordon` + 污点驱逐。

# 四、 Linux 与性能排查

7. **Linux 服务端口连接正常但服务没跑业务，如何排查？**

参考答案：

端口能连说明有进程在监听，但业务没生效，按以下思路排查：

```bash
# 1. 确认监听的进程到底是谁（可能被别的进程占用了端口！）
netstat -tlnp | grep <端口>
ss -tlnp | grep <端口>
lsof -i :<端口>

# 2. 如果是自己的进程，确认启动状态与健康
ps -ef | grep <进程名>
systemctl status <服务名>

# 3. 看日志（启动是否报错、是否在空转）
journalctl -u <服务名> -f
tail -f /var/log/<服务>/<服务>.log

# 4. 检查进程资源与线程（可能主进程活着但业务线程卡死/假死）
top -H -p <pid>            # 看线程是否在消耗 CPU
jstack <pid>               # Java 应用：看线程状态（Blocked/Waiting）

# 5. 检查网络层：端口能连是否只是"内核在监听"（半连接/队列满）
ss -s                     # 连接队列情况
```

**常见原因**：
- 端口被**别的进程占用**（最常见！用 `lsof -i` 确认 PID 是否真的是目标服务）；
- 服务主进程存活但**业务线程假死/死锁**（Java 需 jstack 分析）；
- 服务在**启动中/卡在初始化**；
- 健康检查/探针失败导致流量不进来（负载均衡摘除了节点）。

8. **如何通过非侵入式手段精确定位生产环境的服务卡顿问题？**

参考答案：

"非侵入"= 不改代码、不加埋点，用系统层与运行时工具分析：

**（1）先看系统层指标**：CPU、内存、磁盘 IO、网络：

```bash
top           # 看 CPU 使用率与进程
iostat -x 1   # 磁盘 IO 是否成为瓶颈（%util、await）
vmstat 1      # 看 r（运行队列）、b（阻塞 IO）
```

**（2）Java 应用用 JDK 自带工具（无需改代码）**：

```bash
# 抓线程快照：看线程处于什么状态、卡在哪个方法
jstack <pid> > thread.txt

# 看 GC 是否频繁/停顿
jstat -gcutil <pid> 1000        # FGC/FGCT 过高说明 Full GC 卡顿
jstat -gc <pid> 1000

# 看堆内存与类加载
jmap -heap <pid>

# 火焰图（perf + async-profiler，非侵入采样）
```

**（3）配合性能分析工具采样**：

```bash
# 进程级 CPU 采样火焰图
perf top -p <pid>
# 或用 async-profiler（Java 推荐）：无侵入采集 CPU/分配火焰图
```

**（4）定位"卡顿点"的经典手段**：

- 连续抓多次 `jstack`（间隔几秒），看**大量线程长时间停留在同一个方法**，即卡点；
- 结合 `jstat` 排除 GC 停顿（Full GC 过长会全局卡顿）；
- 看是否锁竞争（线程状态 Blocked）；
- 数据库侧配合慢查询日志、`show processlist` 看是否有 SQL 阻塞；
- 网络侧看是否有连接积压、超时重试。

**（5）通用兜底**：抓系统调用 `strace -p <pid> -c`（短时间采样），看卡在 read/write/锁等哪个系统调用上。

**方法论总结**：CPU 高 → 火焰图定位热方法；CPU 正常但卡 → 看锁/IO/GC/网络等待（jstack + jstat + 数据库慢日志）。
