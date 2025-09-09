import * as vscode from 'vscode';
import { DayRecordManager } from './dayRecordManager';
import { DayAnalysisManager } from './dayAnalysisManager';

export class DataAnalysisProvider {
    private panel: vscode.WebviewPanel | undefined;
    private dayRecordManager: DayRecordManager;
    private dayAnalysisManager: DayAnalysisManager;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.dayRecordManager = new DayRecordManager(context);
        this.dayAnalysisManager = new DayAnalysisManager(context);
    }

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'enpractice.dataAnalysis',
            'English Practice Analysis',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'requestDateList':
                    await this.sendDateList();
                    break;
                case 'requestDateData':
                    await this.sendDateData(data.date);
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初始化时发送日期列表
        this.sendDateList();
    }

    private async sendDateList() {
        if (!this.panel) return;

        try {
            // 从 globalState 获取日期列表
            const totalRecords = await this.dayRecordManager.getTotalRecords();
            
            // 从 totalRecords 中提取日期并排序
            const dates = totalRecords
                .map((record: any) => record.date)
                .sort((a: string, b: string) => b.localeCompare(a)); // 降序排列，最新的在前

                this.panel.webview.postMessage({
                type: 'dateList',
                dates: dates
            });

        } catch (error) {
            console.error('发送日期列表失败:', error);
        }
    }

    private async sendDateData(date: string) {
        if (!this.panel) return;

        try {
            
            // 直接从每日记录获取数据，而不是从快照数据获取
            const normalRecord = await this.dayRecordManager.getDayRecord(date, 'normal');
            const dictationRecord = await this.dayRecordManager.getDayRecord(date, 'dictation');

            // 构建数据结构
            const data: any = {
                date: date,
                modes: {
                    normal: {
                        words: normalRecord ? normalRecord.words : []
                    },
                    dictation: {
                        words: dictationRecord ? dictationRecord.words : []
                    }
                }
            };

            this.panel.webview.postMessage({
                type: 'dateData',
                date: date,
                data: data
            });

        } catch (error) {
            console.error(`发送日期数据失败: ${date}`, error);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>English Practice Analysis</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                }
                
                .header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .date-selector {
                        flex: 1;
                    }
                    
                    select {
                        background-color: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        border: 1px solid var(--vscode-dropdown-border);
                        padding: 4px 8px;
                        border-radius: 2px;
                        min-width: 120px;
                    }
                    
                    .button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 12px;
                        border-radius: 2px;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    
                    .button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    
                    .stats-container {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 20px;
                        margin-bottom: 20px;
                    }
                    
                    .stat-card {
                        background-color: var(--vscode-editor-widget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                        padding: 15px;
                    }
                    
                    .stat-title {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-foreground);
                    }
                    
                    .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: var(--vscode-charts-green);
                    }
                    
                    .stat-detail {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    
                    .words-container {
                        background-color: var(--vscode-editor-widget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                        padding: 15px;
                        margin-bottom: 20px;
                        overflow-x: auto;
                    }
                    
                    .words-header {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-foreground);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .words-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 13px;
                    }
                    
                    .words-table th {
                        background-color: var(--vscode-editor-widget-background);
                        border: 1px solid var(--vscode-widget-border);
                        padding: 8px 12px;
                        text-align: left;
                        font-weight: bold;
                        color: var(--vscode-foreground);
                        cursor: pointer;
                        user-select: none;
                    }
                    
                    .words-table th:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .words-table td {
                        border: 1px solid var(--vscode-widget-border);
                        padding: 8px 12px;
                        background-color: var(--vscode-input-background);
                    }
                    
                    .words-table tr:hover td {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .correct-count {
                        color: var(--vscode-charts-green);
                    }
                    
                    .error-count {
                        color: var(--vscode-charts-red);
                    }
                    
                    .correct-rate {
                        font-weight: bold;
                    }
                    
                    .correct-rate.high {
                        color: var(--vscode-charts-green);
                    }
                    
                    .correct-rate.medium {
                        color: var(--vscode-charts-yellow);
                    }
                    
                    .correct-rate.low {
                        color: var(--vscode-charts-red);
                    }
                    
                    .empty-state {
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                        padding: 40px 20px;
                    }
                    
                    .mode-tabs {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 15px;
                    }
                    
                    .mode-tab {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    
                    .mode-tab.active {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    
                    .loading {
                        text-align: center;
                        padding: 20px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .dict-summary {
                        background-color: var(--vscode-editor-widget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    
                    .dict-summary-header {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-foreground);
                    }
                    
                    .dict-item {
                        padding: 12px 0;
                        border-bottom: 1px solid var(--vscode-widget-border);
                    }
                    
                    .dict-item:last-child {
                        border-bottom: none;
                    }
                    
                    .dict-header {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 8px;
                    }
                    
                    .dict-name {
                        font-weight: bold;
                    }
                    
                    .dict-stats {
                        display: flex;
                        gap: 15px;
                    }
                    
                    .dict-stat-item {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .chapter-list {
                        margin-left: 20px;
                        padding: 8px 0;
                        border-left: 2px solid var(--vscode-widget-border);
                        padding-left: 10px;
                    }
                    
                    .chapter-list-header {
                        font-size: 12px;
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: var(--vscode-foreground);
                    }
                    
                    .chapter-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 4px 0;
                    }
                    
                    .chapter-number {
                        font-size: 12px;
                        color: var(--vscode-foreground);
                    }
                    
                    .chapter-stats {
                        display: flex;
                        gap: 10px;
                    }
                    
                    .chapter-stat-item {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .filter-container {
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    
                    .filter-container label {
                        font-size: 13px;
                        color: var(--vscode-foreground);
                    }
                    
                    .filter-container select {
                        background-color: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        border: 1px solid var(--vscode-dropdown-border);
                        padding: 4px 8px;
                        border-radius: 2px;
                        font-size: 13px;
                        min-width: 120px;
                    }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>📊 数据分析</h2>
                <div class="date-selector">
                    <select id="dateSelector">
                        <option value="">选择日期</option>
                    </select>
                </div>
                <button class="button" id="refreshBtn">🔄 刷新</button>
            </div>
            
            <div class="mode-tabs">
                <button class="mode-tab active" data-mode="normal">📝 正常模式</button>
                <button class="mode-tab" data-mode="dictation">✏️ 默写模式</button>
                <button class="mode-tab" data-mode="all">📈 全部数据</button>
            </div>
            
            <div id="content">
                <div class="loading">加载中...</div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // 当前选择的模式
                let currentMode = 'normal';
                // 当前显示的数据
                let currentData = null;
                // 当前选择的日期
                let selectedDate = '';
                
                // 页面加载时请求日期列表
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 刷新按钮
                document.getElementById('refreshBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 日期选择器变化
                document.getElementById('dateSelector').addEventListener('change', (e) => {
                    selectedDate = e.target.value;
                    if (selectedDate) {
                        vscode.postMessage({ type: 'requestDateData', date: selectedDate });
                    }
                });
                
                // 模式切换
                document.querySelectorAll('.mode-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        currentMode = tab.dataset.mode;
                        // 更新内容显示
                        if (currentData) {
                            updateContent(currentData);
                        }
                    });
                });
                
                // 接收来自扩展的消息
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'dateList':
                            updateDateSelector(message.dates);
                            // 自动选择最新日期并加载数据
                            if (message.dates && message.dates.length > 0) {
                                const latestDate = message.dates[0];
                                selectedDate = latestDate;
                                document.getElementById('dateSelector').value = latestDate;
                                vscode.postMessage({ type: 'requestDateData', date: latestDate });
                            }
                            break;
                        case 'dateData':
                            currentData = message.data;
                            updateContent(message.data);
                            break;
                    }
                });
                
                function updateDateSelector(dates) {
                    const selector = document.getElementById('dateSelector');
                    selector.innerHTML = '<option value="">选择日期</option>';
                    
                    dates.forEach(date => {
                        const option = document.createElement('option');
                        option.value = date;
                        option.textContent = date;
                        selector.appendChild(option);
                    });
                }
                
                function updateContent(data) {
                    const content = document.getElementById('content');
                    
                    if (!data) {
                        content.innerHTML = '<div class="empty-state">暂无数据</div>';
                        return;
                    }

                    // 根据当前模式过滤数据
                    let normalWords = data.modes.normal.words || [];
                    let dictationWords = data.modes.dictation.words || [];
                    let displayWords = [];
                    
                    switch (currentMode) {
                        case 'normal':
                            displayWords = normalWords;
                            break;
                        case 'dictation':
                            displayWords = dictationWords;
                            break;
                        case 'all':
                        default:
                            displayWords = [...normalWords, ...dictationWords];
                            break;
                    }
                    
                    // 构建统计信息
                    const statsHtml = 
                        '<div class="stats-container">' +
                            '<div class="stat-card">' +
                                '<div class="stat-title">今日练习单词数</div>' +
                                '<div class="stat-value">' + displayWords.length + '</div>' +
                                '<div class="stat-detail">正常模式: ' + normalWords.length + ' | 默写模式: ' + dictationWords.length + '</div>' +
                            '</div>' +
                            '<div class="stat-card">' +
                                '<div class="stat-title">词典数量</div>' +
                                '<div class="stat-value">' + (displayWords.length > 0 ? new Set(displayWords.map(w => w.dictId)).size : 0) + '</div>' +
                                '<div class="stat-detail">不同词典的练习记录</div>' +
                            '</div>' +
                        '</div>';
                    
                    // 构建词典统计信息
                    const dictSummaryHtml = generateDictSummary(displayWords, data);
                    
                    // 生成表格形式的单词统计
                    const wordsTableHtml = generateWordsTable(displayWords, data);
                    
                    content.innerHTML = statsHtml + dictSummaryHtml + wordsTableHtml;
                }
                
                // 生成词典统计摘要
                function generateDictSummary(words, allData) {
                    if (words.length === 0) {
                        return '';
                    }
                    
                    // 从所有数据中获取词典统计信息
                    const dictStats = getDictStatistics(allData);
                    
                    // 转换为数组并按词典名称排序
                    const dictList = Object.entries(dictStats).map(([dictId, stats]) => ({
                        dictId,
                        dictName: stats.dictName,
                        practiceCount: stats.practiceCount,
                        correctCount: stats.correctCount,
                        errorCount: stats.errorCount,
                        correctRate: stats.correctRate,
                        completionCount: stats.completionCount,
                        chapters: stats.chapters || {} // 添加章节信息
                    }));
                    
                    // 按词典名称排序
                    dictList.sort((a, b) => a.dictName.localeCompare(b.dictName));
                    
                    // 生成HTML
                    let dictItemsHtml = '';
                    dictList.forEach(dict => {
                        // 计算正确率显示
                        const correctRateDisplay = dict.practiceCount > 0 ? 
                            (dict.correctRate.toFixed(1) + '%') : '0%';
                        
                        // 生成章节列表
                        let chapterListHtml = '';
                        const chapterNumbers = Object.keys(dict.chapters).sort((a, b) => parseInt(a) - parseInt(b));
                        if (chapterNumbers.length > 0) {
                            chapterListHtml += '<div class="chapter-list">';
                            chapterListHtml += '<div class="chapter-list-header">章节统计:</div>';
                            chapterNumbers.forEach(chapterNum => {
                                const chapter = dict.chapters[chapterNum];
                                const chapterRate = chapter.practiceCount > 0 ? 
                                    ((chapter.correctCount / chapter.practiceCount) * 100).toFixed(1) + '%' : '0%';
                                // 计算章节完成次数（所有单词正确次数中的最小值）
                                const chapterCompletionCount = chapter.wordCorrectCounts && chapter.wordCorrectCounts.length > 0 ? 
                                    Math.min(...chapter.wordCorrectCounts) : 0;
                                chapterListHtml += 
                                    '<div class="chapter-item">' +
                                        '<span class="chapter-number">第' + chapterNum + '章</span>' +
                                        '<div class="chapter-stats">' +
                                            '<span class="chapter-stat-item">练习: ' + chapter.practiceCount + '</span>' +
                                            '<span class="chapter-stat-item">正确: ' + chapter.correctCount + '</span>' +
                                            '<span class="chapter-stat-item">错误: ' + chapter.errorCount + '</span>' +
                                            '<span class="chapter-stat-item">正确率: ' + chapterRate + '</span>' +
                                            '<span class="chapter-stat-item">完成: ' + chapterCompletionCount + '</span>' +
                                        '</div>' +
                                    '</div>';
                            });
                            chapterListHtml += '</div>';
                        }
                        
                        dictItemsHtml += 
                        '<div class="dict-item">' +
                            '<div class="dict-header">' +
                                '<span class="dict-name">' + dict.dictName + '</span>' +
                                '<div class="dict-stats">' +
                                    '<span class="dict-stat-item">练习: ' + dict.practiceCount + '</span>' +
                                    '<span class="dict-stat-item">正确: ' + dict.correctCount + '</span>' +
                                    '<span class="dict-stat-item">错误: ' + dict.errorCount + '</span>' +
                                    '<span class="dict-stat-item">正确率: ' + correctRateDisplay + '</span>' +
                                    '<span class="dict-stat-item">完成: ' + dict.completionCount + '</span>' +
                                '</div>' +
                            '</div>' +
                            chapterListHtml +
                        '</div>';
                    });
                    
                    return '<div class="dict-summary">' +
                            '<div class="dict-summary-header">词典统计</div>' +
                            dictItemsHtml +
                        '</div>';
                }
                
                // 从所有数据中获取词典统计信息
                function getDictStatistics(allData) {
                    const dictStats = {};
                    
                    // 根据当前模式处理数据
                    switch (currentMode) {
                        case 'normal':
                            // 处理正常模式数据
                            if (allData.modes.normal.words) {
                                processDictsForStats(allData.modes.normal.words, dictStats);
                            }
                            break;
                        case 'dictation':
                            // 处理默写模式数据
                            if (allData.modes.dictation.words) {
                                processDictsForStats(allData.modes.dictation.words, dictStats);
                            }
                            break;
                        case 'all':
                        default:
                            // 处理正常模式数据
                            if (allData.modes.normal.words) {
                                processDictsForStats(allData.modes.normal.words, dictStats);
                            }
                            
                            // 处理默写模式数据
                            if (allData.modes.dictation.words) {
                                processDictsForStats(allData.modes.dictation.words, dictStats);
                            }
                            break;
                    }
                    
                    // 计算每个词典的正确率和完成次数
                    Object.keys(dictStats).forEach(dictId => {
                        const stats = dictStats[dictId];
                        if (stats.practiceCount > 0) {
                            stats.correctRate = (stats.correctCount / stats.practiceCount) * 100;
                        } else {
                            stats.correctRate = 0;
                        }
                        
                        // 完成次数取所有单词中正确次数的最小值
                        if (stats.wordCorrectCounts.length > 0) {
                            stats.completionCount = Math.min(...stats.wordCorrectCounts);
                        } else {
                            stats.completionCount = 0;
                        }
                        
                        // 计算每个章节的正确率和完成次数
                        Object.keys(stats.chapters).forEach(chapterNum => {
                            const chapter = stats.chapters[chapterNum];
                            if (chapter.practiceCount > 0) {
                                // 计算章节正确率
                                chapter.correctRate = (chapter.correctCount / chapter.practiceCount) * 100;
                            } else {
                                chapter.correctRate = 0;
                            }
                            
                            // 计算章节完成次数（该章节内所有单词正确次数中的最小值）
                            if (chapter.wordCorrectCounts.length > 0) {
                                chapter.completionCount = Math.min(...chapter.wordCorrectCounts);
                            } else {
                                chapter.completionCount = 0;
                            }
                        });
                    });
                    
                    return dictStats;
                }
                
                // 处理词典数据以生成统计信息
                function processDictsForStats(words, dictStats) {
                    // 首先按词典和单词分组统计
                    const wordStats = {};
                    words.forEach(word => {
                        const dictKey = word.dictId;
                        const wordKey = dictKey + '-' + word.word;
                        const chapterKey = word.chapterNumber.toString();
                        
                        // 初始化词典统计
                        if (!dictStats[dictKey]) {
                            dictStats[dictKey] = {
                                dictName: word.dictName,
                                practiceCount: 0,
                                correctCount: 0,
                                errorCount: 0,
                                correctRate: 0,
                                completionCount: 0,
                                wordCorrectCounts: [], // 用于计算完成次数
                                chapters: {} // 添加章节统计信息
                            };
                        }
                        
                        // 初始化章节统计
                        if (!dictStats[dictKey].chapters[chapterKey]) {
                            dictStats[dictKey].chapters[chapterKey] = {
                                practiceCount: 0,
                                correctCount: 0,
                                errorCount: 0,
                                wordCorrectCounts: {} // 用于计算章节完成次数，记录每个单词的正确次数
                            };
                        }
                        
                        // 初始化单词统计
                        if (!wordStats[wordKey]) {
                            wordStats[wordKey] = {
                                practiceCount: 0,
                                correctCount: 0,
                                errorCount: 0
                            };
                        }
                        
                        // 累计单词练习数据
                        wordStats[wordKey].practiceCount++;
                        if (word.isCorrect) {
                            wordStats[wordKey].correctCount++;
                        } else {
                            wordStats[wordKey].errorCount++;
                        }
                        
                        // 累计章节练习数据
                        dictStats[dictKey].chapters[chapterKey].practiceCount++;
                        if (word.isCorrect) {
                            dictStats[dictKey].chapters[chapterKey].correctCount++;
                        } else {
                            dictStats[dictKey].chapters[chapterKey].errorCount++;
                        }
                        
                        // 记录每个单词的正确次数用于计算完成次数
                        if (!dictStats[dictKey].chapters[chapterKey].wordCorrectCounts[word.word]) {
                            dictStats[dictKey].chapters[chapterKey].wordCorrectCounts[word.word] = 0;
                        }
                        if (word.isCorrect) {
                            dictStats[dictKey].chapters[chapterKey].wordCorrectCounts[word.word]++;
                        }
                    });

                    // 累计词典统计数据
                    Object.keys(wordStats).forEach(wordKey => {
                        const dictId = wordKey.split('-').slice(0, -1).join('-');
                        const stats = wordStats[wordKey];
                        if (dictStats[dictId]) {
                            dictStats[dictId].practiceCount += stats.practiceCount;
                            dictStats[dictId].correctCount += stats.correctCount;
                            dictStats[dictId].errorCount += stats.errorCount;
                            dictStats[dictId].wordCorrectCounts.push(stats.correctCount);
                        }
                    });
                    
                    // 计算每个章节的单词正确次数数组
                    Object.keys(dictStats).forEach(dictId => {
                        const dict = dictStats[dictId];
                        Object.keys(dict.chapters).forEach(chapterNum => {
                            const chapter = dict.chapters[chapterNum];
                            // 将单词正确次数对象转换为数组
                            chapter.wordCorrectCounts = Object.values(chapter.wordCorrectCounts);
                        });
                    });
                }
                
                // 生成表格形式的单词统计
                function generateWordsTable(words, allData) {
                    if (words.length === 0) {
                        return '<div class="empty-state">今日暂无练习记录</div>';
                    }
                    
                    // 从所有数据中获取单词统计信息
                    const wordStats = getWordStatistics(allData);
                    
                    // 根据当前模式筛选单词
                    let filteredWords = words;
                    if (currentMode !== 'all') {
                        // 在当前模式下过滤单词
                        filteredWords = words.filter(word => {
                            // 这里需要根据当前模式来判断单词属于哪种模式
                            // 由于数据结构中没有直接标识单词属于哪种模式，我们需要通过其他方式判断
                            // 我们可以根据传入的words参数来判断，因为words已经是根据模式筛选过的
                            return true;
                        });
                    }
                    
                    // 获取所有词典列表用于筛选
                    const dictList = [...new Set(filteredWords.map(w => w.dictId))].map(dictId => {
                        const word = filteredWords.find(w => w.dictId === dictId);
                        return { id: dictId, name: word ? word.dictName : dictId };
                    });
                    
                    // 生成筛选器HTML
                    let filterHtml = '<div class="filter-container">';
                    filterHtml += '<label for="dictFilter">词典筛选: </label>';
                    filterHtml += '<select id="dictFilter" onchange="filterTable()">';
                    filterHtml += '<option value="all">全部词典</option>';
                    dictList.forEach(dict => {
                        filterHtml += '<option value="' + dict.id + '">' + dict.name + '</option>';
                    });
                    filterHtml += '</select>';
                    filterHtml += '</div>';
                    
                    // 生成表格HTML
                    let tableHtml = 
                        '<div class="words-container">' +
                            '<div class="words-header">' +
                                '<span>单词练习统计</span>' +
                                '<span>' + Object.keys(wordStats).length + ' 个不同单词</span>' +
                            '</div>' +
                            filterHtml +
                            '<table class="words-table" id="wordsTable">' +
                                '<thead>' +
                                    '<tr>' +
                                        '<th onclick="sortTable(0)">单词 ▼</th>' +
                                        '<th onclick="sortTable(1)">词典 ▼</th>' +
                                        '<th onclick="sortTable(2)">章节 ▼</th>' +
                                        '<th onclick="sortTable(3)">练习次数 ▼</th>' +
                                        '<th onclick="sortTable(4)">正确次数 ▼</th>' +
                                        '<th onclick="sortTable(5)">错误次数 ▼</th>' +
                                        '<th onclick="sortTable(6)">正确率 ▼</th>' +
                                    '</tr>' +
                                '</thead>' +
                                '<tbody id="wordsTableBody">';
                    
                    // 按单词名称排序
                    const sortedWords = Object.entries(wordStats).sort((a, b) => a[0].localeCompare(b[0]));
                    
                    // 生成表格行
                    sortedWords.forEach(([word, stats]) => {
                        // 计算正确率类别
                        let rateClass = 'low';
                        if (stats.correctRate >= 80) {
                            rateClass = 'high';
                        } else if (stats.correctRate >= 60) {
                            rateClass = 'medium';
                        }
                        
                        // 获取词典信息
                        const dictInfo = filteredWords.find(w => w.word === word);
                        const dictName = dictInfo ? dictInfo.dictName : '未知';
                        const dictId = dictInfo ? dictInfo.dictId : 'unknown';
                        
                        tableHtml += 
                            '<tr data-dict="' + dictId + '">' +
                                '<td>' + word + '</td>' +
                                '<td>' + dictName + '</td>' +
                                '<td>' + (dictInfo ? dictInfo.chapterNumber : '未知') + '</td>' +
                                '<td>' + stats.practiceCount + '</td>' +
                                '<td class="correct-count">' + stats.correctCount + '</td>' +
                                '<td class="error-count">' + stats.errorCount + '</td>' +
                                '<td class="correct-rate ' + rateClass + '">' + stats.correctRate.toFixed(1) + '%</td>' +
                            '</tr>';
                    });
                    
                    tableHtml += 
                                '</tbody>' +
                            '</table>' +
                        '</div>';
                    
                    return tableHtml;
                }
                
                // 从所有数据中获取单词统计信息
                function getWordStatistics(allData) {
                    const wordStats = {};
                    
                    // 根据当前模式处理数据
                    switch (currentMode) {
                        case 'normal':
                            if (allData.modes.normal.words) {
                                processWordsForStats(allData.modes.normal.words, wordStats);
                            }
                            break;
                        case 'dictation':
                            if (allData.modes.dictation.words) {
                                processWordsForStats(allData.modes.dictation.words, wordStats);
                            }
                            break;
                        case 'all':
                        default:
                            // 处理正常模式数据
                            if (allData.modes.normal.words) {
                                processWordsForStats(allData.modes.normal.words, wordStats);
                            }
                            
                            // 处理默写模式数据
                            if (allData.modes.dictation.words) {
                                processWordsForStats(allData.modes.dictation.words, wordStats);
                            }
                            break;
                    }
                    
                    // 计算每个单词的正确率
                    Object.keys(wordStats).forEach(word => {
                        const stats = wordStats[word];
                        if (stats.practiceCount > 0) {
                            stats.correctRate = (stats.correctCount / stats.practiceCount) * 100;
                        }
                    });
                    
                    return wordStats;
                }
                
                // 处理单词数据以生成统计信息
                function processWordsForStats(words, wordStats) {
                    words.forEach(word => {
                        if (!wordStats[word.word]) {
                            wordStats[word.word] = {
                                practiceCount: 0,
                                correctCount: 0,
                                errorCount: 0,
                                correctRate: 0
                            };
                        }
                        
                        wordStats[word.word].practiceCount++;
                        if (word.isCorrect) {
                            wordStats[word.word].correctCount++;
                        } else {
                            wordStats[word.word].errorCount++;
                        }
                    });
                }
                
                // 格式化时间显示
                function formatTime(timeString) {
                    try {
                        const date = new Date(timeString);
                        return (date.getMonth() + 1) + '-' + date.getDate() + ' ' + date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    } catch (error) {
                        return '未知时间';
                    }
                }
                
                // 筛选表格
                function filterTable() {
                    const filter = document.getElementById('dictFilter').value;
                    const table = document.getElementById('wordsTable');
                    const tr = table.getElementsByTagName('tr');
                    
                    for (let i = 1; i < tr.length; i++) {
                        const dictId = tr[i].getAttribute('data-dict');
                        if (filter === 'all' || dictId === filter) {
                            tr[i].style.display = '';
                        } else {
                            tr[i].style.display = 'none';
                        }
                    }
                }
                
                // 排序表格
                let sortDirections = [true, true, true, true, true, true, true]; // true表示升序，false表示降序
                
                function sortTable(columnIndex) {
                    const table = document.getElementById('wordsTable');
                    const tbody = table.getElementsByTagName('tbody')[0];
                    const rows = Array.from(tbody.getElementsByTagName('tr'));
                    
                    // 切换排序方向
                    sortDirections[columnIndex] = !sortDirections[columnIndex];
                    const ascending = sortDirections[columnIndex];
                    
                    // 更新表头箭头
                    const headers = table.getElementsByTagName('th');
                    for (let i = 0; i < headers.length; i++) {
                        const arrow = headers[i].textContent.includes('▲') || headers[i].textContent.includes('▼') ? 
                            headers[i].textContent.slice(0, -2) : headers[i].textContent;
                        headers[i].textContent = arrow + (i === columnIndex ? (ascending ? ' ▲' : ' ▼') : ' ▼');
                    }
                    
                    // 排序行
                    rows.sort((a, b) => {
                        const aText = a.getElementsByTagName('td')[columnIndex].textContent;
                        const bText = b.getElementsByTagName('td')[columnIndex].textContent;
                        
                        let aVal, bVal;
                        
                        // 根据列类型处理排序
                        if (columnIndex === 0 || columnIndex === 1 || columnIndex === 2) {
                            // 文本列（单词、词典、章节）
                            aVal = aText;
                            bVal = bText;
                        } else if (columnIndex === 6) {
                            // 正确率列，去掉%符号
                            aVal = parseFloat(aText.replace('%', ''));
                            bVal = parseFloat(bText.replace('%', ''));
                        } else {
                            // 数字列
                            aVal = parseFloat(aText);
                            bVal = parseFloat(bText);
                        }
                        
                        if (aVal < bVal) {
                            return ascending ? -1 : 1;
                        }
                        if (aVal > bVal) {
                            return ascending ? 1 : -1;
                        }
                        return 0;
                    });
                    
                    // 重新插入排序后的行
                    rows.forEach(row => tbody.appendChild(row));
                }
            </script>
        </body>
        </html>`;
    }
}