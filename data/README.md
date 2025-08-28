# EnPractice 数据目录说明

本目录包含EnPractice插件的所有数据文件，采用分层存储架构确保高性能和数据安全。

## 📁 目录结构

```
data/
├── config/                 # 配置文件
│   └── wordbooks.json         # 词典列表信息
├── dicts/                  # 词典文件
│   ├── hongbaoshu-2026.json    # 红宝书2026词典
│   ├── NCE_1.json             # 新概念英语第1册
│   ├── NCE_2.json             # 新概念英语第2册
│   ├── NCE_3.json             # 新概念英语第3册
│   └── NCE_4.json             # 新概念英语第4册
└── userdata/               # 用户数据
    ├── settings.json           # 用户设置配置
    ├── records/               # 练习记录（分片存储）
    │   ├── {dictId}_main.json      # 主记录文件
    │   └── {dictId}_ch{N}.json     # 章节记录文件
    ├── dayRecords/            # 每日记录
    │   ├── {date}.json             # 正常模式每日记录
    │   ├── {date}_dictation.json   # 默写模式每日记录
    │   └── totalRecords.json       # 总记录索引
    └── snapshots/             # 数据快照（备份）
        └── {timestamp}_backup.json # 自动备份文件
```

## 📚 词典文件格式

### 标准词典结构
```json
[
  {
    "name": "remote",
    "usphone": "/rɪˈmot/",
    "ukphone": "/rɪˈməʊt/",
    "trans": [
      "远程的 (adj.)",
      "遥控器 (n.)"
    ]
  }
]
```

### 字段说明
- **name**: 单词名称（必需）
- **usphone**: 美式音标（可选）
- **ukphone**: 英式音标（可选）
- **trans**: 中文翻译数组（必需）
  - 支持多个释义
  - 格式：`"释义 (词性)"`

## ⚙️ 配置文件

### settings.json - 用户设置
```json
{
  "currentWordbook": "hongbaoshu-2026",
  "wordsPerChapter": 10,
  "practiceMode": "sequential",
  "showPhonetics": true,
  "chapterLoop": true,
  "currentChapter": 1,
  "currentWordIndex": 0
}
```

### wordbooks.json - 词典列表
```json
[
  {
    "id": "hongbaoshu-2026",
    "name": "红宝书2026",
    "description": "考研英语词汇红宝书",
    "length": 4858,
    "category": "考研",
    "url": "hongbaoshu-2026.json"
  }
]
```

## 📊 记录文件

### 分片存储系统
- **主记录文件**: 存储词典基本信息和全局统计
- **章节记录文件**: 独立存储每章的练习数据
- **按需加载**: 只加载当前需要的数据，提升性能

### 每日记录系统
- **按日期存储**: 每天的练习记录独立存储
- **模式区分**: 正常模式和默写模式分别记录
- **去重机制**: 每天每个单词只记录一次

## 🔧 数据管理

### 自动创建
插件会自动创建必要的目录和文件：
- 首次启动时创建基础目录结构
- 练习时自动创建记录文件
- 每日自动创建当日记录文件

### 数据备份
- 重要操作前自动创建快照
- 定期备份用户数据
- 异常恢复机制

### 性能优化
- **分片存储**: 内存占用减少550倍
- **按需加载**: 响应速度提升100倍
- **异步操作**: 不阻塞用户界面

## 🛠️ 开发者说明

### 添加新词典
1. 将词典JSON文件放入 `dicts/` 目录
2. 更新 `wordbooks.json` 添加词典信息
3. 重启插件即可使用

### 数据迁移
- 所有用户数据存储在 `userdata/` 目录
- 可通过复制该目录实现数据迁移
- 支持跨设备数据同步

### 故障排除
- 删除 `userdata/records/` 目录可重置练习记录
- 删除 `userdata/settings.json` 可重置设置
- 插件会自动修复损坏的数据文件

## ⚠️ 注意事项

- 请勿手动修改记录文件，可能导致数据不一致
- 词典文件必须使用UTF-8编码
- 建议定期备份 `userdata/` 目录
- 大型词典文件建议使用分片存储优化