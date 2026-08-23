---
title: 家用pc配置相关
published: 2026-08-10 02:59:30
updated: 2026-08-23 
description: 配置
tags: [学习笔记, 运维, 配置]
category: 学习笔记
slug: study-00-config
image: api
draft: false
password: "123"
author: ylxs
---

# home_配置
## 虚拟机

    rocky01：192.168.31.104 root 123

    rocky02：192.168.31.102 root 123

    rocky03：192.168.31.103 root 123

    rocky04 192.168.31.105 root 123

    tx_01 49.232.4.133 root cyl19991216

## 数据库
    rocky01
    192.168.31.104 3306
    user: cyl
    password: cyl19991216

## 其他配置

    gitlab
    external_url 'http://192.168.31.105:8892'
    gitlab：192.168.31.105:8892
    user:root
    Password: cyl19991216

    Jenkins：
    192.168.31.104:8080

    Zabbix:
    rocky04 : 192.168.31.105/zabbix
    tx_01: 49.232.4.133/zabbix

    k8s:
    control:rocky04
    nodes:rocky01 rocky02 rocky03