---
title: mysql面试题
published: 2026-08-15
updated: 2026-08-15
description: mysql面试题
tags: [面试,mysql]
category: 面试
slug: interview_mysql-20260815-01
author: ylxs
---
# 一、基础架构与存储引擎
1. 请简述MySQL的基础架构分为哪几层？各层的核心职责是什么？

参考答案：MySQL采用分层插件式架构，核心分为Server层和存储引擎层。

Server层：是MySQL的核心逻辑处理层，所有存储引擎共享。涵盖连接器（管理连接、权限验证）、分析器（词法/语法分析）、优化器（生成执行计划、索引选择）、执行器（操作引擎返回结果）。同时包含内置函数、视图、触发器、binlog日志等。

存储引擎层：负责数据的物理读写与持久化。插件式设计，支持InnoDB、MyISAM等。Server层通过统一的Handler API与存储引擎交互，不感知底层细节。

2. InnoDB和MyISAM引擎的核心区别是什么？生产环境为什么普遍推荐InnoDB？

参考答案：这是运维面试的必考题。

事务：InnoDB支持ACID事务；MyISAM不支持。

锁粒度：InnoDB默认行级锁（高并发友好）；MyISAM表级锁（并发写入性能差）。

崩溃恢复：InnoDB通过Redo/Undo日志支持崩溃恢复；MyISAM不支持，易损坏。

索引结构：InnoDB是聚簇索引（数据与主键索引存储在一起）；MyISAM是非聚簇索引（索引与数据分离）。

推荐理由：电商、交易等高并发、写密集场景，InnoDB的行锁和事务能力是刚需。MyISAM仅适用于历史归档等极少量只读场景。

3. MySQL连接建立后，管理员修改了用户权限，为什么当前已建立的连接不生效？

参考答案：MySQL在连接建立时，连接器会一次性将用户的全量权限加载到该连接的内存上下文中。后续该连接内的所有操作均基于这份内存副本做校验，不会重新读取权限表。只有新建立的连接才会加载新的权限。

4. 长连接可能导致内存溢出，生产环境如何优化？

参考答案：MySQL执行SQL过程中的临时内存（如结果集、排序缓冲）会附着在连接对象上，只有连接断开才释放。长期使用长连接且执行大查询会导致内存持续累积。优化方案包括：合理设置wait_timeout自动释放空闲连接，或定期执行mysql_reset_connection重置连接状态（无需重连）。

# 二、索引设计与查询优化
5. 索引有哪些常见类型？B+树索引和哈希索引的区别是什么？

参考答案：

索引类型：普通索引、唯一索引、主键索引、全文索引、组合索引。

B+树 vs 哈希：B+树支持范围查询和排序（叶子节点有序链表），磁盘IO友好（一次加载多个索引页）；哈希索引只支持等值查询，冲突时性能不稳定，不支持范围查询。

6. 什么是组合索引的最左前缀原则？

参考答案：在(a, b, c)上建立组合索引，查询条件必须从索引最左列开始且不跳过中间列才能生效。例如：WHERE a=1 AND b=2生效；WHERE b=2 AND c=3（未命中a）不生效。

7. 请列举索引失效的常见场景。

参考答案：

对索引字段使用函数或表达式：WHERE DATE(create_time) = '2023-01-01'。

隐式类型转换：如字段是varchar但条件写where phone = 123。

LIKE查询以%开头：WHERE name LIKE '%张三'。

OR连接非索引列：WHERE name = 'a' OR age = 20（若age无索引则全表扫描）。

8. 如何分析一条SQL的性能？EXPLAIN结果中重点看哪些字段？

参考答案：使用EXPLAIN查看执行计划。重点看：

type：访问类型，从好到差依次是system > const > eq_ref > ref > range > index > ALL（全表扫描），至少应达到range级别。

key：实际命中的索引，判断是否用了预期索引。

rows：预估扫描行数，越少越好。

Extra：是否出现Using filesort（文件排序，需优化）或Using temporary（临时表，需优化）。

# 三、事务、隔离级别与锁机制
9. MySQL的事务隔离级别有哪些？MySQL默认是哪个？

参考答案：

读未提交（Read Uncommitted）：存在脏读、不可重复读、幻读。

读已提交（Read Committed, RC）：解决脏读，存在不可重复读和幻读（Oracle默认）。

可重复读（Repeatable Read, RR）：MySQL默认，解决脏读和不可重复读（通过MVCC），但存在幻读。

串行化（Serializable）：解决所有问题，性能最低（通过锁表）。

10. MVCC（多版本并发控制）是如何实现“读不加锁”的？

参考答案：MVCC是InnoDB实现高并发的核心。

核心组件：每行数据有隐藏列（事务IDDB_TRX_ID、回滚指针DB_ROLL_PTR）指向Undo Log版本链；每个事务生成Read View（包含当前活跃事务ID列表）。

可见性规则：通过对比DB_TRX_ID与Read View的边界判断数据版本是否可见。RR级别下Read View在事务开启时生成一次（保证可重复读）；RC级别下每次查询重新生成（能读到已提交的新数据）。

11. InnoDB有哪些锁？什么是间隙锁（Gap Lock）？

参考答案：

锁分类：共享锁（S锁，读锁）、排他锁（X锁，写锁）；意向锁（IS/IX）；行锁、表锁。

间隙锁：在可重复读（RR） 隔离级别下，为防止幻读，不仅锁定行，还锁定行与行之间的“间隙”。当执行范围查询（如WHERE id BETWEEN 10 AND 20）时，会锁住该范围内的间隙，阻止其他事务插入新数据。

12. 死锁是如何产生的？如何排查和解决？

参考答案：

产生原因：多个事务互相持有对方需要的锁，循环等待。例如事务A锁住行1请求行2，事务B锁住行2请求行1。

排查：使用SHOW ENGINE INNODB STATUS\G查看死锁日志；开启innodb_print_all_deadlocks记录到错误日志；用performance_schema监控锁等待。

解决：设置合理的innodb_lock_wait_timeout超时参数；调整业务逻辑，约定访问表的顺序；使用pt-deadlock-logger工具定期抓取死锁。

# 四、日志体系（Redo/Binlog/Undo）
13. Binlog、Redo log、Undo log各自的作用是什么？

参考答案：

Redo log（重做日志，InnoDB特有）：保证事务的持久性（Durability）。记录的是物理级别的修改（页的修改）。预写日志机制（WAL）：写数据前先写日志，即使宕机，重启后通过Redo log重做恢复已提交事务。

Binlog（归档日志，Server层）：用于数据备份、主从复制。记录的是逻辑SQL语句（如UPDATE）。所有存储引擎共用。

Undo log（回滚日志，InnoDB特有）：保证事务的原子性（Atomicity），是MVCC的基础。记录数据修改前的旧版本，用于事务回滚和提供一致性读。

14. 什么是MySQL的两阶段提交（2PC）？

参考答案：在事务提交时，为了保证Binlog和Redo log的一致性（尤其是崩溃恢复和主从数据一致），MySQL采用内部XA两阶段提交：

Prepare阶段：InnoDB将Redo log写入磁盘并标记为prepare状态。

Commit阶段：Server层将Binlog写入磁盘。Binlog写成功后，InnoDB将Redo log标记为commit状态，事务完成。

# 五、主从复制与高可用（运维重点）
15. MySQL异步复制的原理是什么？

参考答案：基于Binlog的同步机制，流程如下：

主库事务提交时将变更写入Binlog。

从库启动I/O线程，连接主库请求Binlog。主库启动Dump线程发送日志给从库。

从库I/O线程将接收到的日志写入本地Relay Log（中继日志）。

从库SQL线程重放Relay Log中的操作，实现数据同步。

16. 什么是半同步复制？解决了什么问题？

参考答案：默认复制是异步的（主库发送完Binlog即返回，不关心从库是否收到），宕机可能导致数据丢失。半同步复制要求：主库提交事务时，必须至少等待一个从库确认已接收并写入Relay Log后才返回客户端成功。这牺牲一定性能，换取了数据一致性（减少丢失风险）。

17. 主从复制延迟常见原因及解决方案有哪些？

参考答案：

原因：主库写入并发高，从库单线程回放跟不上（I/O瓶颈）；网络延迟；从库执行复杂查询（如报表）锁竞争；硬件差异。

解决方案：

架构层：读写分离，将读流量分散到多个从库；引入缓存层（Redis）降低读压力。
参数调优：从库开启并行复制（slave_parallel_workers）；设置sync_binlog=0或1权衡性能与安全；优化从库的innodb_flush_log_at_trx_commit。
监控：通过Seconds_Behind_Master监控延迟，结合pt-query-digest分析慢查询。
18. 如果主库宕机，如何手动将从库提升为新主库？

参考答案：

在所有从库上执行SHOW SLAVE STATUS\G，记录Relay_Master_Log_File和Exec_Master_Log_Pos，选择Pos值最大（数据最新）的从库作为新主库。

在选定的从库上执行STOP SLAVE; RESET MASTER;，修改配置文件开启Binlog。

在其他从库上执行CHANGE MASTER TO指向新主库，使用选定的Pos值开始同步。

修改应用层数据库连接IP（或VIP漂移）。

19. 你了解哪些MySQL高可用架构？

参考答案：

MHA（Master High Availability）：目前较为成熟，自动故障转移（0-30秒），需配合VIP或DNS。缺点是有脑裂风险，管理节点单点。

MGR（MySQL Group Replication）：基于Paxos协议的强一致高可用，支持多主（不建议），但技术较新，对网络要求高。

读写分离中间件：如MyCat、ShardingSphere-Proxy、ProxySQL，结合一主多从做流量分发。

# 六、运维实操与性能排查（高频）
20. 生产环境MySQL CPU飙升到100%，你的排查思路是什么？

参考答案：通常是SQL大量全表扫描或索引失效导致。

定位线程：top -H -p <mysqld_pid> 找到CPU占用高的线程ID（TID）。

找到SQL：通过performance_schema.threads表关联THREAD_OS_ID找到对应的MySQL内部线程ID和正在执行的SQL。

分析慢查询：开启慢查询日志，使用pt-query-digest分析，找出慢语句，用EXPLAIN看执行计划，优化索引或SQL写法。

应急：先KILL掉该线程释放资源，再优化业务代码。

21. 数据库内存使用率过高如何排查？

参考答案：MySQL内存主要由全局缓冲和连接线程私有缓冲组成。

查看SHOW VARIABLES LIKE 'innodb_buffer_pool_size';确认缓冲池大小是否过大。

统计连接数内存消耗：SELECT * FROM memory_by_thread_by_current_bytes查看各线程内存占用，排查是否有大量复杂排序/临时表操作。

查看performance_schema的innodb_buffer_stats_by_table，判断哪些表占用了大量Buffer Pool内存。

22. 如何利用Binlog进行数据恢复？

参考答案：利用mysqlbinlog工具解析Binlog，按时间点或位置恢复到指定时刻。

sql
mysqlbinlog --start-datetime="2023-01-01 10:00:00" --stop-datetime="2023-01-01 11:00:00" binlog.000001 | mysql -u root -p
常用于误删数据后的闪回恢复。

23. 常用的备份工具和备份策略有哪些？

参考答案：

逻辑备份：mysqldump（单线程导出，适用于数据量较小的库）。

物理备份：Percona XtraBackup（热备神器，支持增量备份，对InnoDB事务引擎友好，不影响业务）。

策略：一般核心业务采用每周全量 + 每天增量 + Binlog归档的方案。备份需验证完整性，并定期进行演练。

24. DELETE、TRUNCATE、DROP的区别？

参考答案：

DELETE：DML操作，逐行删除，可回滚（有事务日志），不释放表空间（高水位线保留）。

TRUNCATE：DDL操作，清空表所有数据，不可回滚，释放表空间（重置高水位），速度快。

DROP：DDL操作，删除表结构和数据，释放空间，不可回滚，速度最快。

25. 忘记MySQL root密码怎么办？

参考答案：在配置文件中添加skip-grant-tables跳过权限验证重启MySQL。免密登录后执行UPDATE user SET authentication_string=PASSWORD('新密码') WHERE User='root';，然后刷新权限FLUSH PRIVILEGES;，去掉skip-grant-tables重启恢复正常。

26. MySQL区分大小写由哪个参数控制？

参考答案：lower_case_table_names。

Linux下默认为0（表名区分大小写）。

Windows下默认为1（不区分）。
生产环境通常建议设为1以避免跨平台迁移报错，但需注意该参数在初始化后修改有风险。

27. 如何查看当前数据库的连接数和状态？

参考答案：

SHOW PROCESSLIST; 查看当前所有连接状态及执行的SQL（常用于排查锁等待和慢查询）。

SHOW STATUS LIKE '%Threads_connected%'; 查看当前连接数。

SHOW STATUS LIKE '%Max_used_connections%'; 查看历史最大连接数。

28. 如何监控MySQL主从复制状态？关键监控项有哪些？

参考答案：使用SHOW SLAVE STATUS\G。

关键指标：

Slave_IO_Running / Slave_SQL_Running：必须为Yes。

Seconds_Behind_Master：延迟秒数（0为正常）。

Last_IO_Error / Last_SQL_Error：错误日志字段。

工具：可接入Zabbix、Prometheus（mysql_slave_status采集器）统一监控告警。

29. 如何处理MySQL连接池打满的问题？

参考答案：

快速排查是否有慢SQL堆积或锁等待导致连接不释放（查SHOW PROCESSLIST）。

检查max_connections设置是否合理，适当调大上限。

在应用层配置合理的connectionTimeout和idleTimeout，及时回收空闲连接。

读写分离或分库分表减少单库连接压力。

30. 海量数据下如何进行表结构变更（DDL）？

参考答案：直接执行ALTER TABLE会锁表（Metadata Lock）导致业务中断。运维层面应使用在线DDL工具：

pt-online-schema-change（Percona Toolkit）：通过触发器或交换表的方式无锁变更，不阻塞读写。

gh-ost（GitHub出品）：通过Binlog回放进行无触发器变更，对主库压力小。