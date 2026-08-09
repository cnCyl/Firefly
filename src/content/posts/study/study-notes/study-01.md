---
title: docker学习记录
published: 2026-08-09 21:01:30
description: docker学习
tags: [学习笔记, 运维, docker]
category: 学习笔记
slug: study-01-docker
image: api
author: ylxs
---


# 🐳 Docker 从入门到生产运用 · 全流程学习计划

本计划分为 **6 个阶段**，预计总时长 **6~8 周**（每天投入 1~2 小时）。每个阶段包含核心知识点、实操任务和推荐资源。


## 📅 第一阶段：基础概念与安装（第 1 周）

### 目标

理解 Docker 是什么、为什么用、核心术语（镜像、容器、仓库、Dockerfile）。

### 内容

1. **虚拟化 vs 容器化**​
    
    - 传统虚拟机与 Docker 的区别
        
    - 容器轻量、快速、可移植的优势
        
    
2. **安装与配置**​
    
    - Windows/macOS/Linux 安装 Docker Desktop 或 Docker Engine
        
    - 验证安装：`docker version`, `docker info`
        
    - 设置镜像加速器（国内用户推荐阿里云/腾讯云加速）
        
    
3. **第一个容器**​
    
    - `docker run hello-world`
        
    - `docker run -it ubuntu bash` 体验交互式容器
        
    - `docker ps`、`docker stop`、`docker rm`
        
    

### 实操任务

- 成功运行 nginx 容器并访问默认页面
    
- 学会拉取、列出、删除镜像（`docker pull`, `docker images`, `docker rmi`）
    

### 推荐资源

- [Docker 官方入门教程](https://docs.docker.com/get-started/)
    
- 《Docker —— 从入门到实践》在线版
    



## 📅 第二阶段：镜像构建与 Dockerfile（第 2 周）

### 目标

掌握编写 Dockerfile 的方法，构建自定义镜像。

### 内容

1. **Dockerfile 指令详解**​
    
    - `FROM`, `RUN`, `COPY`, `ADD`, `WORKDIR`, `EXPOSE`, `CMD`, `ENTRYPOINT`
        
    - 多阶段构建（Multi-stage Build）优化镜像大小
        
    
2. **构建与标签**​
    
    - `docker build -t myapp:v1 .`
        
    - 给镜像打标签并推送到私有/公有仓库（Docker Hub, Harbor）
        
    
3. **镜像层缓存原理**​
    
    - 理解分层机制，优化构建速度
        
    

### 实操任务

- 为简单的 Python Flask 应用编写 Dockerfile
    
- 构建镜像并运行，验证功能
    
- 将镜像推送至 Docker Hub
    

### 推荐资源

- [Dockerfile 最佳实践](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
    
- Play with Docker 在线实验室
    



## 📅 第三阶段：数据持久化与网络（第 3 周）

### 目标

管理容器数据（卷、绑定挂载）和容器间通信。

### 内容

1. **数据持久化**​
    
    - `VOLUME` 指令与匿名卷
        
    - 绑定挂载（Bind Mount）：`-v /host/path:/container/path`
        
    - `tmpfs` 挂载临时内存存储
        
    - 实战：MySQL 数据目录挂载到宿主机
        
    
2. **网络模式**​
    
    - bridge（默认）、host、none、自定义网络
        
    - 容器互联：`--link`（已弃用）vs 自定义网络 DNS 解析
        
    - 端口映射：`-p host_port:container_port`
        
    
3. **多容器协作**​
    
    - 使用 `docker network create` 创建独立网络
        
    - 让两个容器（如 Web + DB）通过服务名互相访问
        
    

### 实操任务

- 部署 WordPress + MySQL 两个容器，实现数据持久化和网络互通
    
- 尝试备份/恢复挂载的数据卷
    

### 推荐资源

- Docker 官方文档《Manage data in Docker》
    
- 实验：通过 `docker inspect` 查看网络详情
    



## 📅 第四阶段：编排利器 Docker Compose（第 4 周）

### 目标

用 YAML 文件定义和运行多容器应用。

### 内容

1. **Compose 文件结构**​
    
    - `version`, `services`, `networks`, `volumes`
        
    - 环境变量与 `.env` 文件
        
    
2. **常用命令**​
    
    - `docker-compose up -d`（启动）
        
    - `docker-compose down`（停止并清理）
        
    - `docker-compose logs`, `ps`, `exec`
        
    
3. **实战项目**​
    
    - 将之前的 WordPress + MySQL 改写为 docker-compose.yml
        
    - 添加 Redis 缓存、Nginx 反向代理
        
    

### 实操任务

- 搭建一个完整的 LEMP 栈（Linux + Nginx + MySQL + PHP）并用 Compose 管理
    
- 学会使用 `docker-compose scale`（旧版本）或 replicas（Swarm 模式）
    

### 推荐资源

- [官方 Compose 文件参考](https://docs.docker.com/compose/compose-file/)
    
- 《Docker Compose 实战》博客系列
    



## 📅 第五阶段：生产环境必备技能（第 5~6 周）

### 目标

安全加固、监控日志、资源限制、CI/CD 集成。

### 内容

1. **安全最佳实践**​
    
    - 不使用 root 运行容器（USER 指令）
        
    - 只读根文件系统（`--read-only`）
        
    - 限制内核能力（`--cap-drop ALL --cap-add ...`）
        
    - 镜像漏洞扫描（Trivy, Clair）
        
    
2. **资源限制**​
    
    - CPU：`--cpus`, `--cpu-shares`
        
    - 内存：`-m`, `--memory-reservation`
        
    - 磁盘 I/O：`--device-read-bps`, `--write-bps`
        
    
3. **日志与监控**​
    
    - 日志驱动：json-file, journald, fluentd
        
    - 使用 `docker stats` 实时查看资源
        
    - 集成 Prometheus + cAdvisor 监控容器
        
    
4. **健康检查与重启策略**​
    
    - `HEALTHCHECK` 指令
        
    - `--restart always/on-failure/no`
        
    
5. **CI/CD 流水线**​
    
    - 在 GitHub Actions / GitLab CI 中构建镜像
        
    - 自动推送到仓库并部署到测试环境
        
    

### 实操任务

- 为生产环境编写安全的 Dockerfile（非 root、只读、最小镜像）
    
- 配置资源限制并观察效果
    
- 搭建一套简单的 CI 流程：代码 push → 自动构建 → 单元测试 → 镜像推送
    

### 推荐资源

- [Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
    
- 《Docker in Production》电子书
    



## 📅 第六阶段：集群与容器编排（第 7~8 周）

### 目标

了解 Kubernetes 基础，以及 Docker Swarm 的使用。

### 内容

1. **Docker Swarm（可选）**​
    
    - 初始化 Swarm 集群（`docker swarm init`）
        
    - 部署服务（`docker service create`）
        
    - 滚动更新与回滚
        
    
2. **Kubernetes 入门（推荐重点）**​
    
    - Pod、Deployment、Service、Ingress 概念
        
    - 使用 Minikube 或 kind 搭建本地集群
        
    - 将 docker-compose 应用迁移到 K8s（Kompose 工具）
        
    
3. **生产运维要点**​
    
    - 镜像仓库管理（Harbor, Nexus）
        
    - 配置中心与密钥管理（ConfigMap, Secret）
        
    - 蓝绿部署、金丝雀发布
        
    

### 实操任务

- 用 Docker Swarm 部署一个三节点服务（简单体验）
    
- 用 Kubernetes 部署一个 Nginx 应用，暴露 Service 并实现负载均衡
    
- 学习 `kubectl` 常用命令
    

### 推荐资源

- Kubernetes 官方教程（[kubernetes.io/docs/tutorials](https://kubernetes.io/docs/tutorials/)）
    
- 《深入剖析 Kubernetes》（张磊）—— 适合进阶
    



## ✅ 总结：学习路线图

```
基础 → 镜像构建 → 数据/网络 → Compose → 生产加固 → 编排
第1周     第2周       第3周       第4周      第5-6周     第7-8周
```

### 每日习惯建议

- 每天至少敲 3 条新命令
    
- 每周完成一个小项目（如部署个人博客、API 服务）
    
- 遇到错误先查日志：`docker logs <container>`，再 Google 错误信息
    

### 最终产出

学完后你应该能：

- 独立编写 Dockerfile 并优化镜像大小
    
- 用 Compose 管理开发环境
    
- 在生产环境中安全地运行容器（限制资源、监控日志）
    
- 具备向 Kubernetes 迁移的基础知识
    

祝学习顺利！如有具体环节卡住，随时来问我。


# 启动容器
docker run -d --name nginx_1.30 -p 8080:80 nginx:1.30
docker run -d --name nginx_new -p 8081:80 nginx:latest

| **<br><br>命令<br><br>** | **<br><br>作用<br><br>** |
| - | - |
| `docker start <容器名>`   | 重启**已存在**的容器（保留原状态）    |
| `docker run <镜像名>`     | 基于镜像**新建**一个容器         |


# 删除

docker rm  删除容器
docker rmi 删除镜像

# 创建自定义网络
docker network create docker_test


# 创建临时容器
docker run --rm --network docker_test alpine:latest ping mysql-test
“--rm” 创建后删除


# docker数据持久化
通过宿主机的目录挂载到容器目录，把容器数据同步写入到宿主机，实现数据持久化 

# Dockerfile

# 基础指令
### 1.FROM 
指定基础镜像，第一条命令  FROM alpine:latest
### 2.WORKDIR
指定工作目录
### 3.COPY
拷贝文件/目录到镜像里面  COPY dockerfile .   >> 拷贝文件dockerfile 到当前目录
### 4.ADD
负责文件到当前目录，支持URL和自动解压 ADD app.tar.gz /app
### 5.RUN
在构建的时候执行命令  RUN apt-get update
### 6.CMD
容器启动默认指令 CMD echo "hello world"
### 7.ENTRYPOINT
容器启动时的入口点，不会被覆盖

## 网络和存储命令
### 1.EXPOSE
声明容器监听端口 EXPOSE 8080
### 2.VOLUME
创建挂载点 VOLUME ["/data"]

## 环节配置指令
### 1.ENV 
设置环境变量 ENV NAME1=$NAME
### 2.AVG
定义构建时代参数 AVG NAME="docker"

## 健康检查和Shell指令
### 1.HEALTHCHECK
定义容器健康检查 HEALTHCHECK CMD curl -f http://localhost/
### 2.SHELL
指定默认shell命令 SHELL ["/bin/bash","-c"]
指定默认shell命令 SHELL ["/bin/sh","-c"]