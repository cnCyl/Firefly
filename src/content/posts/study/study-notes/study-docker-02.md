---
title: docker学习笔记
published: 2026-08-10 18:44:30
description: docker学习笔记
tags: [学习计划, 运维, docker]
category: 学习笔记
slug: study-docker-02
image: api
author: ylxs
---


# 启动容器
```
docker run -d --name nginx_1.30 -p 8080:80 nginx:1.30
docker run -d --name nginx_new -p 8081:80 nginx:latest
```


| **<br><br>命令<br><br>** | **<br><br>作用<br><br>**           |
| ------------------------ | ---------------------------------- |
| `docker start <容器名>`  | 重启**已存在**的容器（保留原状态） |
| `docker run <镜像名>`    | 基于镜像**新建**一个容器           |


# 删除
```
docker rm  删除容器
docker rmi 删除镜像
```

# 创建自定义网络
```
docker network create docker_test
```

# 创建临时容器
```
docker run --rm --network docker_test alpine:latest ping mysql-test
--rm 创建后删除
```

# docker数据持久化
通过宿主机的目录挂载到容器目录，把容器数据同步写入到宿主机，实现数据持久化 

--- 
# Dockerfile

## 基础指令

### 1.FROM 
指定基础镜像，第一条命令  `FROM alpine:latest`
### 2.WORKDIR
指定工作目录
### 3.COPY
拷贝文件/目录到镜像里面  ` COPY dockerfile . ` 拷贝文件dockerfile 到当前目录
### 4.ADD
负责文件到当前目录，支持URL和自动解压 `ADD app.tar.gz /app`
### 5.RUN
在构建的时候执行命令  `RUN apt-get update`
### 6.CMD
容器启动默认指令 `CMD echo "hello world" `
### 7.ENTRYPOINT
容器启动时的入口点，不会被覆盖

## 网络和存储命令
### 1.EXPOSE
声明容器监听端口 `EXPOSE 8080`
### 2.VOLUME
创建挂载点 ` VOLUME ["/data"] `

## 环节配置指令
### 1.ENV 
设置环境变量 `ENV NAME1=$NAME `
### 2.AVG
定义构建时代参数 `AVG NAME="docker" `

## 健康检查和Shell指令

### 1.HEALTHCHECK
定义容器健康检查 `HEALTHCHECK CMD curl -f http://localhost/ `
### 2.SHELL
指定默认shell命令 `SHELL ["/bin/bash","-c"] `  
指定默认shell命令 `SHELL ["/bin/sh","-c"] `

---

# docker Compose

## 介绍
Docker Compose 是 Docker 官方推出的多容器编排工具，用于定义和运行由多个 Docker 容器组成的应用。它通过一个 YAML 配置文件（通常是 docker-compose.yml）来描述整个应用的组件（服务）、网络、卷等依赖关系，然后用一条命令启动/停止所有服务。  
简单来说，Compose 解决了单机环境下多容器管理的痛点：手动一个个 docker run，也不用担心容器间的网络连接和依赖顺序。

## 示例
```
// 该示例为pc上的nas配置的WordPress+mysql 
services:
  wordpress:
    container_name: wordpress
    image: wordpress:latest
    privileged: true
    restart: always
    volumes:
      - ./wordpress/data:/var/www/html
    environment:
      WORDPRESS_DB_HOST: wordpressdb:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: 123456
    ports:
      - "38010:80"
    networks:
      - app-network

  wordpressdb:
    image: mariadb:10.6
    restart: always
    volumes:
      - ./mariadb/data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: 123456
    ports:
      - "33308:3306"
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```