---
title: liunx面试题
published: 2026-08-15
updated: 2026-08-15
description: liunx面试题
tags: [面试,liunx]
category: 面试
slug: interview_linux-20260815-01
author: ylxs
---

# 一、 系统基础与启动流程
1. Linux系统完整的启动流程是怎样的？

参考答案：

BIOS/UEFI：硬件自检，加载CMOS中的启动顺序，找到引导设备。  
BootLoader（GRUB）：加载内核选择菜单，加载内核和initrd（初始内存盘）到内存。
内核初始化：挂载根文件系统（只读模式），启动内核进程（PID=0的swapper）。  
systemd（或SysV init）：作为PID=1的进程启动，执行默认运行级别下的所有服务。  
用户登录：显示getty登录提示符。  

1. Linux的运行级别（Runlevel）有哪些？systemd中对应的target是什么？

参考答案：
SysV init时代：0（关机）、1（单用户维护）、2（多用户无NFS）、3（完整多用户文本模式）、4（未使用）、5（图形界面）、6（重启）。  
systemd时代：用target替代运行级别，对应关系：runlevel3 → multi-user.target，runlevel5 → graphical.target。使用systemctl get-default查看当前默认target。

3. /etc/fstab 文件的作用是什么？挂载时常见的字段有哪些？

参考答案：fstab用于配置开机自动挂载的文件系统。每行包含6个字段：

设备名（如/dev/sdb1）或UUID。  
挂载点（如/data）。  
文件系统类型（如ext4、xfs）。  
挂载选项（defaults、noatime等）。  
dump备份标志（0或1）。  
fsck检查顺序（0表示不检查，根目录为1，其他为2）。  

# 二、 进程管理与性能排查
4. PID=1的进程是什么？它在系统中的作用是什么？

参考答案：在systemd系统中，PID=1是systemd进程，它是所有其他进程的祖先进程。职责包括：启动所有系统服务、管理运行级别、监控子进程状态、回收孤儿进程（孤儿进程会被systemd收养）。

5. top命令中，load average的三个数值分别代表什么？如何判断系统负载过高？

参考答案：三个数值分别代表1分钟、5分钟、15分钟的平均负载（正在运行+等待运行的进程数，包含不可中断IO等待）。判断标准：如果负载值持续超过CPU核心数（如nproc查到的逻辑核数），说明系统过载。需结合%us（用户态CPU）、%sy（内核态CPU）、%wa（IO等待）综合分析瓶颈。

6. ps aux和ps -ef的区别？如何查看某个进程的实时资源占用？

参考答案：

ps aux：使用BSD风格输出（显示USER、PID、%CPU、%MEM、VSZ、RSS、TTY、STAT、START、TIME、COMMAND）。  
ps -ef：使用System V风格输出（显示UID、PID、PPID、C、STIME、TTY、TIME、CMD）。
实时查看：使用top -p <PID>或htop（更直观），也可用pidstat -p <PID> 1（每秒输出）。  

7. kill -9和kill -15的区别是什么？

参考答案：

kill -15（SIGTERM，默认）：优雅终止信号，进程收到后可自行清理资源（如关闭文件、释放锁）、保存状态后退出，进程可捕获此信号执行收尾逻辑。  
kill -9（SIGKILL）：强制杀死信号，进程无法捕获或忽略，内核直接回收进程资源，可能导致数据丢失或僵尸进程残留。生产环境应优先使用-15，-9作为最后手段。  

8. 系统中出现大量“僵尸进程”（Zombie Process）如何排查和清理？

参考答案：

成因：子进程退出后，父进程未调用wait()/waitpid()回收子进程的退出状态，导致子进程退出后变成僵尸态（<defunct>）。  

排查：ps aux | grep 'Z' 或 top查看僵尸数量。  

清理：无法直接kill僵尸进程（已死亡）。需找到其父进程（PPID），通过kill -15杀掉父进程，僵尸进程会被PID=1的systemd收养并释放。若父进程是系统关键进程，则需重启系统或升级程序代码。  

# 三、 内存与磁盘管理
9. free -m输出中，buff/cache占用过高怎么办？如何手动释放？

参考答案：buff（缓冲区，块设备元数据）+ cache（缓存，文件内容）是Linux提升IO性能的机制，正常情况下无需手动释放。若确需释放（如做性能测试）：  
```
bash
sync  # 将缓存数据同步到磁盘
echo 1 > /proc/sys/vm/drop_caches  # 释放页缓存
echo 2 > /proc/sys/vm/drop_caches  # 释放dentries和inodes缓存
echo 3 > /proc/sys/vm/drop_caches  # 释放全部缓存
```
但生产环境不建议轻易执行，会导致磁盘IO瞬时飙升影响业务。  

10. 如何查看系统内存的实际可用量（考虑buff/cache可回收部分）？

参考答案：执行free -m，看available列（而非free列）。available = free + 可回收的buff/cache（未被应用程序锁定的部分），这是新进程真正能申请到的内存量。

11. df -h和du -sh的区别和使用场景？

参考答案：

df -h：查看文件系统级别的磁盘分区总容量、已用、可用、挂载点。统计维度基于磁盘超级块（superblock）。  
du -sh <目录>：查看目录级别的实际文件大小总和。常用于排查“/目录空间不足但找不到大文件”的问题。  
注意：df显示已删但未被释放的文件占用空间（可通过`lsof | grep deleted`排查），du不计算已删除但进程仍持有的文件。  

12. lsof命令的常见应用场景有哪些？

参考答案：lsof（List Open Files）是运维排障利器：  
```
查看端口占用：lsof -i :8080（查哪个进程占用了端口）。
查看已删除但仍被进程占用的文件（占磁盘空间）：lsof | grep deleted。
查看某个PID打开了哪些文件：lsof -p <PID>。
查看某个用户打开的文件：lsof -u username。
```

# 四、 网络管理与故障排查
13. netstat和ss命令的区别？生产环境推荐用哪个？

参考答案：

netstat：传统工具，通过遍历/proc/net获取信息，性能差，大并发场景卡顿。  
ss：新一代工具，直接通过Netlink从内核获取socket统计，速度快、开销小。生产环境强烈推荐用ss替代netstat。  
常用命令：ss -tunlp（显示所有TCP/UDP监听端口及进程）。

14. ping不通目标主机，排查思路是什么？

参考答案：

检查本地网卡状态：ip addr/ifconfig确认IP配置正确。  
检查网关连通性：ping 网关IP，不通则查路由表route -n。  
检查DNS解析：nslookup或dig域名，确认域名解析正确。  
检查防火墙：iptables -L -n或firewall-cmd --list-all，确认ICMP未被DROP。  
检查目标主机是否禁ping：sysctl net.ipv4.icmp_echo_ignore_all。  
检查网络设备（交换机ACL、安全组策略）。  

15. traceroute（或mtr）命令的作用是什么？

参考答案：

traceroute：通过发送TTL递增的UDP/ICMP包，探测到达目标IP所经过的每一跳路由器，用于定位网络中断点或延迟瓶颈。  
mtr（My TraceRoute）：结合ping和traceroute，持续发送探测包并统计每一跳的丢包率和延迟，是更强大的网络质量诊断工具。  

16. /etc/resolv.conf文件的作用是什么？如何配置DNS？

参考答案：配置Linux系统的DNS域名解析。关键参数：

nameserver 114.114.114.114：指定DNS服务器IP（最多3个）。  
search example.com：指定域名搜索后缀（解析短域名时自动补全）。  
注意：在NetworkManager管理的系统中，手动修改resolv.conf可能被覆盖，应通过nmcli或网卡配置文件（/etc/sysconfig/network-scripts/ifcfg-eth0）中的DNS1=xxx来配置。

17. iptables的五个链（chain）和四个表（table）分别是什么？

参考答案：

五链（数据包流向路径）：PREROUTING（路由前）、INPUT（入站）、FORWARD（转发）、OUTPUT（出站）、POSTROUTING（路由后）。  
四表（按功能划分）：raw（连接跟踪）、mangle（包标记）、nat（网络地址转换）、filter（包过滤，默认）。  
优先级顺序：raw → mangle → nat → filter。

# 五、 文件权限与安全
18. Linux文件权限rwx分别代表什么？目录的x权限有何特殊含义？

参考答案：

r（读）：文件可查看内容；目录可列出目录下文件名（ls）。  
w（写）：文件可修改内容；目录可在其中创建/删除文件（需同时有x）。  
x（执行）：文件可执行；目录可进入（cd）及访问目录下文件的inode信息。目录若无x权限，即使有r也无法ls查看文件属性。  

19. chmod命令中，数字权限755和644分别表示什么？

参考答案：

755：属主有rwx（7），属组有r-x（5），其他人有r-x（5）。常用于目录或可执行文件。  
644：属主有rw-（6），属组有r--（4），其他人有r--（4）。常用于普通文件（配置文件、日志等）。  

20. sudo和su的区别是什么？如何配置sudo权限？

参考答案：

su -：切换用户身份，需知道目标用户的密码。su - root表示切换到root并加载root的环境变量。  
sudo：以其他用户（默认root）的权限执行单条命令，需输入当前用户的密码，通过/etc/sudoers文件（用visudo编辑）精细化授权。  
配置示例：username ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx（允许某用户免密重启nginx）。  

# 六、 文本处理与Shell脚本（运维必会）
21. grep、sed、awk被称为“三剑客”，请简述各自的核心用途。

参考答案：

grep：文本过滤，根据正则表达式输出匹配的行（查日志神器）。  
sed：流编辑器，对文本进行替换、删除、插入操作（非交互式修改配置文件）。  
awk：文本格式化/报告生成器，擅长按列处理、统计分析（如awk '{print $1}'提取第一列）。  

22. 如何用sed在配置文件中替换/修改某个参数？

参考答案：  
`sed -i 's/原字符串/新字符串/g' 文件名`  

`示例：sed -i 's/^SELINUX=.*/SELINUX=disabled/g' /etc/selinux/config（修改SELinux配置）。`  

-i表示直接修改文件，-i.bak会先备份再修改。

23. 如何用awk统计nginx访问日志中每个IP的访问次数并排序？

参考答案：经典运维考题：
```
bash
awk '{print $1}' access.log | sort | uniq -c | sort -nr | head -10
```
解释：awk提取第一列（IP），sort排序使相同IP相邻，uniq -c去重并统计次数，sort -nr按次数降序排序，head -10取Top 10。

24. Shell脚本中`$?、$0、$#、$@`分别代表什么？

参考答案：

```
$?:上一条命令的退出状态码 (0表示成功，非0表示失败)。  
$0:脚本本身的文件名。  
$#:传递给脚本的参数个数。  
$@:所有参数列表（作为独立的字符串）。
```

25. 如何编写一个Shell脚本定时清理7天前Nginx日志的cron任务？

参考答案：
```
bash
#!/bin/bash
find /var/log/nginx/ -name "*.log" -mtime +7 -exec rm -f {} \;
添加cron：0 2 * * * /usr/local/bin/clean_nginx_log.sh（每天凌晨2点执行）。
```

七、 系统调优与故障应急
26. 修改Linux系统最大文件打开数（ulimit -n）的方法有哪些？

参考答案：

临时生效：`ulimit -n 65535`（仅当前会话）。

永久生效（系统级）：  
```
修改/etc/security/limits.conf：
text
soft nofile 65535
hard nofile 65535
``` 
进程级：在服务的systemd unit文件中设置LimitNOFILE=65535。   
注意：需退出当前shell重新登录生效，用ulimit -a验证。

27. 如何查看Linux系统当前的内核参数（如TCP TIME_WAIT数量）？

参考答案：  
查看TCP连接状态统计：  
`ss -s 或 netstat -ant | awk '{print $1}' | sort | uniq -c。`

查看具体内核参数：  
`sysctl net.ipv4.tcp_tw_reuse、sysctl net.ipv4.tcp_fin_timeout。`  

临时修改：`sysctl -w net.ipv4.tcp_tw_reuse=1。`  

永久修改：`vim /etc/sysctl.conf 后 sysctl -p加载。`  

28. 系统时间不准如何同步？NTP和Chrony的区别？

参考答案：  

手动同步：`date -s "2026-08-15 10:00:00"`  

自动同步：生产环境使用NTP（Network Time Protocol）或Chrony（更快、更适合间歇性网络环境，RHEL 7+默认）。  
操作：ntpdate ntp.aliyun.com（一次性同步）；或配置/etc/ntp.conf，启动ntpd服务持续微调。  
Chrony优势：初始同步速度快，对虚拟机/云主机更友好，支持硬件时间戳。

29. 服务器磁盘IO负载高（%util接近100%），排查步骤是什么？

参考答案：  
使用iostat -x 1查看各设备的%util、await、svctm，定位繁忙磁盘。  
使用iotop查看哪个进程在大量读写磁盘。  
使用lsof查看进程打开了哪些文件，定位具体日志或数据文件。  
排查是否有慢查询（MySQL）或大文件拷贝、日志切割等操作。  
优化：换SSD、调整IO调度器（cfq改noop/deadline）、分散IO负载。  

30. 服务器无法SSH登录，可能的原因及排查路径？

参考答案：这是高频故障场景。

```
网络层面：检查IP能否ping通，安全组/防火墙是否放行22端口（telnet IP 22测试）。
服务层面：systemctl status sshd看服务是否运行，ss -tunlp | grep 22确认监听。
认证层面：密码错误/密钥权限不对（.ssh/authorized_keys权限应为600），/etc/ssh/sshd_config中PasswordAuthentication是否为yes。
资源层面：系统内存/CPU耗尽或/var分区满（df -h检查），导致无法创建登录进程。
安全层面：/etc/hosts.deny或fail2ban是否封禁了客户端IP。
终极方案：通过服务器带外管理（BMC/控制台）登录排查。
```

31.  如何在Linux上快速查找一个文件？find和locate的区别？

参考答案：

find：实时遍历目录树查找，精确但慢，支持按名称、大小、时间、权限等复杂条件搜索。示例：find / -name "nginx.conf" 2>/dev/null。  
locate：查预构建的数据库（/var/lib/mlocate/mlocate.db），速度极快，但数据库默认每天更新一次，新建文件查不到。需先执行updatedb更新库。  

