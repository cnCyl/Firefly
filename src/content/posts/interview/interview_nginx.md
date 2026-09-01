---
title: nginx面试题
published: 2026-09-01
updated: 2026-09-01
description: nginx面试题
tags: [面试,nginx]
category: 面试
slug: interview_nginx-20260901-01
author: ylxs
---

# 一、 Nginx 基础与架构

1. **Nginx 是什么？与 Apache 相比有什么优势？**

参考答案：

- Nginx 是一个高性能的 **HTTP 服务器 / 反向代理服务器 / 邮件代理服务器**，采用 C 语言编写，以高并发、低资源占用著称。
- 与 Apache 对比：
  - **并发模型**：Nginx 事件驱动（epoll），Apache 进程/线程模型（prefork/worker）；Nginx 单进程可支撑数万并发，Apache 通常几千；
  - **静态资源**：Nginx 处理静态文件性能强，内存占用低；
  - **动态处理**：Apache 自带模块较多（如 PHP 集成），Nginx 需配合 FastCGI（php-fpm）；
  - **稳定性与配置**：Nginx 配置简洁、热加载（reload）平滑，Apache 配置相对繁琐。
- 结论：高并发、静态资源、反向代理场景首选 Nginx。

2. **Nginx 的进程模型是怎样的？为什么性能高？**

参考答案：

- Nginx 采用 **master-worker 多进程模型**：
  - **master 进程**：管理 worker 进程（fork、监控、信号处理），不处理请求；
  - **worker 进程**：实际处理请求，默认与 CPU 核数相同；
  - 另有 cache manager / cache loader 进程管理缓存。
- 高性能原因：
  - **事件驱动 + 非阻塞 IO**（Linux 下 epoll），单 worker 可并发处理大量连接；
  - 每个 worker 是单线程事件循环，无进程切换开销；
  - worker 之间通过共享内存（accept_mutex）协调连接分发。
- 优化：`worker_processes` 设为 CPU 核数，`worker_connections` 提高单 worker 连接数。

3. **Nginx 的配置文件结构是怎样的？各层级的含义？**

参考答案：

- **main（全局）**：`worker_processes`、`user`、`pid`、`error_log` 等全局配置；
- **events**：事件模型（`worker_connections`、`use epoll`）；
- **http**：HTTP 服务器全局配置（`include mime.types`、`sendfile`、`gzip`、`log_format`、`upstream`、`server`）；
- **server**：虚拟主机（监听端口/域名、`location`、`root`）；
- **location**：URI 匹配规则（`proxy_pass`、`root/alias`、`rewrite`）。

配置加载顺序：`http → server → location`，内层继承外层并可覆盖。

# 二、 安装与编译

4. **Nginx 编译安装和 yum 安装有什么区别？常用编译参数有哪些？**

参考答案：

- **yum 安装**：快速、依赖自动解决、版本固定（仓库版本偏旧），适合标准场景；
- **编译安装**：可自定义模块（如第三方模块）、指定安装路径、性能优化参数，适合定制化需求。
- 常用编译参数：

```bash
./configure \
  --prefix=/usr/local/nginx \
  --with-http_ssl_module \        # HTTPS 支持
  --with-http_stub_status_module  # 状态页（/nginx_status）
  --with-http_gzip_static_module  # 静态 gzip
  --with-http_realip_module       # 真实 IP（配合 CDN/代理）
  --with-stream                   # 四层负载均衡（TCP）
```

5. **Nginx 如何进行平滑升级和回滚？**

参考答案：

- **平滑升级**（不中断服务）：
  1. 备份旧二进制：`mv nginx nginx.old`；
  2. 编译新版本并拷贝新二进制；
  3. `kill -USR2 <master_pid>`：启动新 master 和 worker；
  4. `kill -WINCH <old_master_pid>`：优雅退出旧 worker；
  5. `kill -QUIT <old_master_pid>`：退出旧 master。
- **回滚**：若新版本有问题，恢复旧二进制 `mv nginx.old nginx`，再执行 `kill -HUP <master_pid>` 热重载。

6. **如何查看 Nginx 编译了哪些模块？**

参考答案：

```bash
# 查看静态编译模块
nginx -V

# 查看完整 configure 参数
nginx -V 2>&1

# 动态模块目录
ls /usr/local/nginx/modules/
```

判断某个功能（如 SSL、gzip、stub_status）是否可用，看 `nginx -V` 输出中是否包含对应 `--with-` 参数。

# 三、 虚拟主机与日志

7. **Nginx 如何配置基于域名、端口、IP 的虚拟主机？**

参考答案：

- **基于域名**：

```nginx
server {
    listen 80;
    server_name www.example.com;
    root /data/www;
}
```

- **基于端口**：

```nginx
server {
    listen 8080;
    server_name _;
    root /data/other;
}
```

- **基于 IP**：

```nginx
server {
    listen 192.168.1.10:80;
    server_name _;
    root /data/ip1;
}
```

- 默认 server：`listen 80 default_server;` 作为未匹配时的默认主机。

8. **Nginx 的访问日志如何配置？日志切割怎么做？**

参考答案：

- 日志格式定义与启用：

```nginx
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for"';

server {
    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;
}
```

- **日志切割**：Nginx 本身不自动切割，常用方案：
  - **logrotate**（CentOS 自带）：按天切割 + 压缩 + 保留天数，切割后 `kill -USR1 <nginx_pid>` 重新打开日志文件；
  - 自定义脚本配合 crontab 每日 0 点切割。

9. **Nginx 访问日志常见字段的含义？**

参考答案：

- `$remote_addr`：客户端 IP；
- `$time_local`：请求时间；
- `$request`：请求行（方法 + URI + 协议）；
- `$status`：状态码（200/404/502 等）；
- `$body_bytes_sent`：响应体大小；
- `$http_referer`：来源页面；
- `$http_user_agent`：客户端浏览器标识；
- `$http_x_forwarded_for`：真实客户端 IP（经过代理时，需配合 `realip` 模块）。

# 四、 反向代理与负载均衡

10. **Nginx 反向代理如何配置？proxy_set_header 的作用是什么？**

参考答案：

```nginx
server {
    listen 80;
    server_name www.example.com;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;                    # 传递原 Host
        proxy_set_header X-Real-IP $remote_addr;        # 传递客户端 IP
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # 传递真实 IP 链
        proxy_set_header X-Forwarded-Proto $scheme;     # 传递协议
    }
}
```

`proxy_set_header` 用于**向后端传递请求头**，关键作用是让后端拿到真实客户端信息（IP、协议），否则后端只能看到 Nginx 的 IP。

11. **Nginx 负载均衡 upstream 的算法有哪些？如何做后端健康检查？**

参考答案：

```nginx
upstream backend {
    server 10.0.0.1:8080 weight=3;        # 权重
    server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;  # 失败重试
    server 10.0.0.3:8080 backup;          # 备用
    keepalive 32;                          # 连接复用
}
```

- **算法**：
  - 轮询（默认）、加权轮询（weight）；
  - `ip_hash`：按客户端 IP 会话保持；
  - `least_conn`：最少连接；
  - `least_time`（商业版）、`hash $request_uri`（一致性哈希）。
- **健康检查**：开源版通过 `max_fails + fail_timeout` 被动检测；商业版或第三方（nginx_upstream_check_module）支持主动探测（HTTP/TCP）。

12. **proxy_pass 带路径与不带路径的区别？**

参考答案：

- **不带 URI**（只写 IP:端口）：转发时**保留原 URI**：

```nginx
location /api/ {
    proxy_pass http://backend;        # 请求 /api/user → 后端 /api/user
}
```

- **带 URI**（proxy_pass 后跟路径）：转发时**替换匹配的 location 前缀**：

```nginx
location /api/ {
    proxy_pass http://backend/v2/;    # 请求 /api/user → 后端 /v2/user
}
```

关键区别：proxy_pass 后**是否以 / 结尾**决定了是否重写路径，是高频考点和坑点。

# 五、 URL 重写与防盗链

13. **Nginx rewrite 的语法和 flag 有哪些？**

参考答案：

```nginx
rewrite regex replacement [flag];
```

- **last**：停止当前 location 匹配，重新发起新 URI 匹配；
- **break**：停止重写，不再匹配其他 location；
- **redirect**：返回 302 临时重定向；
- **permanent**：返回 301 永久重定向。

示例（HTTP 跳 HTTPS、URL 规范化）：

```nginx
rewrite ^/(.*)$ https://www.example.com/$1 permanent;
```

14. **location 匹配规则有哪些？优先级是怎样的？**

参考答案：

- **精确匹配 `=`**：`location = /index.html`；
- **前缀匹配 `^~`**：匹配后不再检查正则（`location ^~ /images/`）；
- **正则匹配 `~`（区分大小写）/ `~*`（忽略大小写）**：`location ~* \.(jpg|png)$`；
- **普通前缀匹配**：`location /api/`；
- **默认 `/`**。

**优先级**：`= 精确 > ^~ 前缀 > ~/~* 正则 > 普通前缀 > /`。

注意：普通前缀按最长匹配，正则按配置文件顺序。

15. **Nginx 如何配置防盗链？**

参考答案：

```nginx
location ~* \.(gif|jpg|png|webp|css|js)$ {
    valid_referers none blocked *.example.com example.com;
    if ($invalid_referer) {
        return 403;
    }
    expires 30d;
}
```

- `valid_referers`：允许的来源（`none` 允许直接访问/无 referer、`blocked` 允许无协议头的 referer、域名白名单）；
- `$invalid_referer`：非白名单来源时为真，返回 403 或用 `rewrite` 替换成防盗链图；
- 注意：防盗链只防"不规范的盗链"，正常用户浏览器一般带 Referer。

# 六、 静态资源与缓存

16. **Nginx 静态资源优化有哪些手段？**

参考答案：

```nginx
server {
    location ~* \.(jpg|png|css|js|html)$ {
        expires 30d;                  # 浏览器缓存 30 天
        add_header Cache-Control "public";
        gzip on;                      # 开启压缩
        gzip_types text/plain text/css application/javascript image/svg+xml;
    }
}
```

- **expires**：设置缓存过期时间，减少重复请求；
- **gzip**：压缩文本类资源（CSS/JS/HTML），减少传输体积；
- **sendfile on**：零拷贝，减少用户态/内核态复制；
- **open_file_cache**：缓存文件句柄；
- **tcp_nopush / tcp_nodelay**：优化 TCP 传输。

17. **Nginx gzip 配置要点？和图片压缩的区别？**

参考答案：

```nginx
gzip on;
gzip_comp_level 5;                          # 压缩级别 1-9
gzip_min_length 1k;                         # 小于 1k 不压缩
gzip_types text/plain text/css application/json application/javascript;
gzip_vary on;                               # 响应头 Vary: Accept-Encoding
```

- **gzip** 压缩的是**文本类**资源（HTML/CSS/JS/JSON），图片（jpg/png 本身已压缩）再压收益小且耗 CPU；
- **图片压缩**是图片本身的体积优化（WebP、压缩质量、尺寸），两者不同层次；
- 配合前端可在 JS/CSS 构建时预压缩（`gzip_static`）。

18. **Nginx 的 proxy_cache 缓存如何配置？**

参考答案：

```nginx
http {
    proxy_cache_path /data/nginx/cache levels=1:2 keys_zone=mycache:10m max_size=10g inactive=60m;

    server {
        location / {
            proxy_pass http://backend;
            proxy_cache mycache;
            proxy_cache_valid 200 302 60m;      # 状态码缓存时长
            proxy_cache_key $host$request_uri;   # 缓存键
            add_header X-Cache-Status $upstream_cache_status;  # 命中状态 HIT/MISS
        }
    }
}
```

- 适用场景：图片、静态 API、不频繁变化的内容；
- 注意缓存键设计、动态接口不能缓存或按参数区分、缓存清理（purge 模块）。

# 七、 HTTPS 与安全

19. **Nginx 如何配置 HTTPS？HTTP 如何跳转 HTTPS？**

参考答案：

```nginx
server {
    listen 443 ssl;
    server_name www.example.com;
    ssl_certificate     /etc/nginx/ssl/example.pem;
    ssl_certificate_key /etc/nginx/ssl/example.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
}

# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name www.example.com;
    return 301 https://$host$request_uri;
}
```

- 证书部署：`ssl_certificate`（证书链）+ `ssl_certificate_key`（私钥）；
- 安全建议：只启用 TLS1.2/1.3、关闭弱加密套件、开启 HSTS（`add_header Strict-Transport-Security`）。

20. **Nginx 常见的安全加固措施有哪些？**

参考答案：

```nginx
# 隐藏版本号
server_tokens off;

# 限制请求体大小（防大包攻击）
client_max_body_size 10m;

# 限制单 IP 并发连接数
limit_conn_zone $binary_remote_addr zone=perip:10m;
server { limit_conn perip 20; }

# 限制请求速率
limit_req_zone $binary_remote_addr zone=reqlimit:10m rate=10r/s;
server { limit_req zone=reqlimit burst=20 nodelay; }

# 禁止访问隐藏文件
location ~ /\. { deny all; }

# 防 SQL 注入 / XSS（基础过滤）
if ($query_string ~* "select|insert|union|drop|update|script") { return 403; }
```

- 其他：日志审计、配置访问控制（allow/deny）、最小化运行用户（非 root）、定期补丁升级。

21. **Nginx 限流配置（limit_req / limit_conn）的区别？**

参考答案：

- **limit_req**（请求频率限制）：控制**每秒请求数**，用于防刷接口、防 CC 攻击：

```nginx
limit_req_zone $binary_remote_addr zone=req:10m rate=10r/s;
location /api/ {
    limit_req zone=req burst=20 nodelay;
}
```

  - `burst`：突发缓冲队列大小；`nodelay`：队列内请求不延迟直接处理（超出的返回 503）；
- **limit_conn**（并发连接数限制）：控制**同一 IP 同时连接数**：

```nginx
limit_conn_zone $binary_remote_addr zone=conn:10m;
location / {
    limit_conn conn 20;
}
```

- 区别：一个限制"单位时间请求频率"，一个限制"同时建立的连接数"；实际场景常配合使用。

# 八、 高可用与性能

22. **Nginx 如何做连接数和高并发优化？**

参考答案：

```nginx
worker_processes auto;                # 与 CPU 核数一致
worker_rlimit_nofile 65535;           # 进程文件描述符上限

events {
    use epoll;
    worker_connections 65535;         # 单 worker 最大连接数
    multi_accept on;
}

http {
    keepalive_timeout 65;
    keepalive_requests 1000;          # 单连接复用请求数
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    upstream backend { keepalive 32; } # 后端连接复用
}
```

- 系统层面：调整 `ulimit -n`、`sysctl` 网络参数（`net.core.somaxconn`、`net.ipv4.tcp_tw_reuse`）；
- 理论上限：`最大连接数 = worker_processes × worker_connections`。

23. **Nginx + Keepalived 高可用方案如何实现？**

参考答案：

- 架构：两台 Nginx（主备）+ 虚拟 IP（VIP）+ Keepalived 心跳；
- **Keepalived** 通过 VRRP 协议选举 MASTER/BACKUP，MASTER 持有 VIP；MASTER 故障时 BACKUP 自动接管 VIP；
- 配置要点：

```bash
vrrp_instance VI_1 {
    state MASTER          # 备份机为 BACKUP
    interface eth0
    virtual_router_id 51
    priority 100          # 备份机低于主
    virtual_ipaddress {
        192.168.1.100     # VIP
    }
}
```

- 健康检查：Keepalived 脚本定期检测 Nginx 进程/端口，异常时降级触发切换；
- 注意：VIP 漂移后，交换机/防火墙需放行；客户端或 DNS 指向 VIP 即可。

24. **Nginx 性能瓶颈如何排查？**

参考答案：

```bash
# 1. 查看系统负载
top / uptime

# 2. 查看 Nginx 状态页（需开启 stub_status）
curl http://localhost/nginx_status
# Active connections / accepts / handled / requests / Reading / Writing / Waiting

# 3. 查看连接数
ss -antp | grep nginx | wc -l

# 4. 分析访问日志（QPS、耗时、TOP IP/URL）
awk '{print $4}' access.log | cut -d: -f2 | sort | uniq -c | sort -rn | head

# 5. 查看错误日志
tail -f /var/log/nginx/error.log
```

- 常见瓶颈：连接数打满（worker_connections 不足）、文件描述符不够、后端超时（502/504）、磁盘 IO（日志/缓存）、CPU 高（gzip/正则 rewrite 过多）。

# 九、 常见问题与故障

25. **Nginx 返回 502 / 504 如何排查？**

参考答案：

- **502 Bad Gateway**：Nginx 无法从后端获取有效响应。
  - 后端服务是否启动（端口监听）；
  - 防火墙/安全组是否放行 Nginx 到后端的端口；
  - 后端（php-fpm/Tomcat）进程是否崩溃、日志报错；
  - `fastcgi_pass`/`proxy_pass` 地址配置错误。
- **504 Gateway Timeout**：后端响应超时。
  - 增大超时时间：`proxy_read_timeout` / `fastcgi_read_timeout` / `proxy_connect_timeout`；
  - 后端本身慢（数据库慢查询、业务阻塞），需优化后端；
  - 检查 `worker_connections` 是否被打满导致排队。

26. **Nginx 返回 413、403、404 的常见原因？**

参考答案：

- **413 Request Entity Too Large**：请求体超过 `client_max_body_size`，调大即可（上传场景常见）；
- **403 Forbidden**：目录权限不足（Nginx 用户无读取权限）、索引文件不存在且未开 `autoindex`、`deny` 规则拦截；
- **404 Not Found**：`root` 路径下文件不存在、`location` 匹配到错误 root/alias、软链失效、`try_files` 配置问题。
- 排查方法：`curl -I` 看状态码、看 error.log 的具体报错路径、检查 `nginx -t` 配置语法。

27. **Nginx 负载高、频繁重启怎么排查？**

参考答案：

```bash
# 1. 确认 master/worker 数量与状态
ps -ef | grep nginx

# 2. 查看错误日志
tail -100 /var/log/nginx/error.log

# 3. 分析是不是配置热重载过于频繁
#    每次 reload 会 fork 新 worker，若脚本频繁 reload 会造成资源波动

# 4. 检查是否有攻击（CC/DDoS）
#    结合 access.log 分析请求频率、TOP IP；配合限流/防火墙/WAF

# 5. 查看 worker 是否频繁崩溃（segfault 会记录 core dump）
```

- 常见原因：配置 reload 太频繁、被刷流量、worker 崩溃（模块 bug）、文件描述符耗尽导致 worker 退出重启。

# 十、 实践场景

28. **Nginx 动静分离配置实战？**

参考答案：

```nginx
server {
    listen 80;
    server_name www.example.com;

    # 静态资源直接由 Nginx 处理 + 缓存
    location ~* \.(gif|jpg|jpeg|png|css|js|ico|svg|woff2)$ {
        root /data/static;
        expires 30d;
        add_header Cache-Control "public";
    }

    # 动态请求转发后端
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

- 静态资源走 Nginx（快、缓存），动态请求（.jsp/.do/API）走后端；或静态放 CDN，Nginx 只做反向代理。

29. **如何用 Nginx 实现灰度发布 / 金丝雀发布？**

参考答案：

- **方案一：按权重灰度**（upstream 权重动态调整，配合 reload）：

```nginx
upstream backend {
    server 10.0.0.1:8080;    # 旧版本
    server 10.0.0.2:8080 weight=1;  # 新版本（先给少量流量）
}
```

- **方案二：按客户端/请求特征分流**：

```nginx
# 按特定用户/请求头分流到灰度组
map $http_x_canary $backend {
    default   backend_old;
    canary    backend_new;
}
```

- **方案三：按 IP 或 Cookie 灰度**：`if ($remote_addr ~ "192.168.1.100") { proxy_pass backend_new; }`
- 发布流程：新版本少量流量 → 观察指标（错误率、延迟）→ 逐步调高权重 → 全量后回滚旧节点。

30. **Nginx + CDN 的整体缓存加速方案如何设计？**

参考答案：

- 架构：`用户 → CDN（边缘节点缓存） → 源站 Nginx（缓存层） → 应用后端`
- **CDN 层**：缓存静态资源（图片/CSS/JS），按 URL 哈希分节点，边缘就近回源；
- **Nginx 层**：
  - 静态资源：`expires` + `gzip` 直接本地服务；
  - 动态接口：`proxy_cache` 缓存（按 `proxy_cache_key` 区分参数）；
  - 回源保护：限流、`allow/deny`（仅允许 CDN 回源 IP）、防盗链；
  - 缓存刷新：CDN 刷新 API + Nginx `proxy_cache_purge` 联动；
- 要点：缓存与动态数据的一致性（版本号/指纹 URL）、监控命中率（`X-Cache-Status`）、多级缓存时间策略。
