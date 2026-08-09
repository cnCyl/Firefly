---
title: K8S学习记录
published: 2026-08-10
description: K8S学习
tags: [学习笔记, 运维, K8S]
category: 学习笔记
slug: study-01-K8S
image: api
author: ylxs
---

一句话简述原理：
Kubernetes（k8s）的工作原理是：**你向集群声明应用的期望状态（如部署几个副本、使用什么镜像），控制平面（Control Plane）中的 API Server 接收请求，Scheduler 负责将 Pod 调度到合适的工作节点，Controller Manager 持续监控实际状态并与期望状态比对，若发现偏差则自动调谐（如节点宕机后重新调度 Pod），各 Node 上的 Kubelet 负责执行指令并管理本节点的 Pod 生命周期，从而实现一个自愈、可弹性伸缩的容器编排系统。**

大规模部署分布式应用的平台
管理一系列的主机或者服务器：node 节点
每个节点运行若干个pod：pod：可部署的最小执行单元
由中心计算机进行管理：control plane 控制平面
