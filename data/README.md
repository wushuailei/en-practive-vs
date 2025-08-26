# 数据文件说明

请将您的单词数据JSON文件放在这个 `data` 文件夹中。插件支持多个词书文件。

## 文件要求

- **文件格式**: JSON数组
- **文件扩展名**: `.json`
- **编码**: UTF-8
- **默认文件**: `words.json`（插件首次启动时加载）

## 多词书支持

您可以创建多个词书文件，例如：
- `words.json` - 默认词书
- `basic.json` - 基础词汇
- `advanced.json` - 高级词汇
- `programming.json` - 编程词汇
- `business.json` - 商务英语

在插件设置页面可以随时切换使用的词书。

## 数据结构示例

```json
[
	{
		"usphone": "/rɪˈmot/",
		"ukphone": "/rɪˈməʊt/",
		"name": "remote",
		"trans": [
			"远程的 (adj.)",
			"遥控器 (noun)"
		]
	},
	{
		"usphone": "/rɪˈmuv/",
		"ukphone": "/rɪˈmu:v/",
		"name": "remove",
		"trans": [
			"移除， 去掉 (vt.)"
		]
	}
]
```

## 字段说明

- **name**: 单词名称（必需）
- **usphone**: 美式音标（可选）
- **ukphone**: 英式音标（可选）
- **trans**: 中文翻译数组（必需）
  - 支持多个释义
  - 格式：`"释义 (词性)"`

## 使用方法

1. 将 `words.json` 文件放入此文件夹
2. 重新编译插件：`npm run compile`
3. 按 F5 测试插件
4. 使用左右箭头导航不同的单词

## 注意事项

- 如果没有提供数据文件，插件会使用内置的示例数据
- 音标建议使用国际音标格式
- 翻译数组至少包含一个释义